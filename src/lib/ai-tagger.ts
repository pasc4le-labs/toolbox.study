import type { AiProvider, Tag, Card } from "@/db/schema";
import { generateObject, jsonSchema, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

export interface TaggerResult {
  cardId: number;
  tags: string[]; // tag names, e.g. ["biology", "cell-structure"]
}

export interface TaggerProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export function normalizeTagName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const tagAssignmentSchema = jsonSchema<{
  assignments: Array<{ cardId: number; tags: string[] }>;
}>({
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cardId: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["cardId", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
});

/**
 * Instantiates an AI model from a provider config.
 * Replicates the exact pattern from generate/page.tsx.
 */
function createModel(provider: AiProvider) {
  const providerType = (provider.providerType ?? "openai-compatible") as
    | "openai-compatible"
    | "google"
    | "anthropic";

  const modelId = provider.modelId.replace(/^models\//, "");

  switch (providerType) {
    case "google": {
      const googleProvider = createGoogleGenerativeAI({
        apiKey: provider.apiKey ?? undefined,
      });
      return googleProvider(modelId);
    }
    case "anthropic": {
      const anthropicProvider = createAnthropic({
        apiKey: provider.apiKey ?? undefined,
      });
      return anthropicProvider.languageModel(modelId);
    }
    case "openai-compatible":
    default: {
      const compatibleProvider = createOpenAICompatible({
        name: provider.name,
        apiKey: provider.apiKey ?? undefined,
        baseURL: provider.baseUrl,
      });
      return compatibleProvider.chatModel(modelId);
    }
  }
}

/**
 * Build the prompt for a batch of cards.
 */
export function buildBatchPrompt(
  batchCards: Card[],
  existingTagNames: string[],
): string {
  const existingTagsStr =
    existingTagNames.length > 0
      ? `\n\nEXISTING TAGS (prefer reusing these when applicable):\n${existingTagNames.sort().join(", ")}`
      : "\n\nNo existing tags in database. Create relevant new tags.";

  const cardsStr = batchCards
    .map(
      (c) =>
        `Card ID: ${c.id}\nFront: ${(c.front ?? "").slice(0, 500)}\nBack: ${(c.back ?? "").slice(0, 500)}`,
    )
    .join("\n---\n");

  return `You are a flashcard tagger. Assign relevant topic tags to each card.

For each card, analyze its front (question/prompt) and back (answer/content) and determine appropriate tags.${existingTagsStr}

Respond with a JSON object:
{
  "assignments": [
    { "cardId": <number>, "tags": ["tag1", "tag2"] },
    ...
  ]
}

Guidelines:
- Prefer reusing existing tags when they match.
- Create new tags only when no existing tag fits.
- Tags should be concise, lowercase, hyphenated (e.g., "cell-biology", "photosynthesis").
- Assign 1-5 tags per card.
- Omit tags only if the card truly has no discernible topic.

Cards to tag:
${cardsStr}`;
}

/**
 * Try structured generation; fall back to text + manual parse if it fails.
 */
async function attemptTagging(
  model: ReturnType<typeof createModel>,
  batchCards: Card[],
  existingTagNames: string[],
  abortSignal?: AbortSignal,
): Promise<TaggerResult[]> {
  const prompt = buildBatchPrompt(batchCards, existingTagNames);

  try {
    // Try structured output first
    const result = await generateObject({
      model,
      schema: tagAssignmentSchema,
      prompt,
      abortSignal,
      maxOutputTokens: 4096,
    });

    const data = result.object;
    if (data && Array.isArray(data.assignments)) {
      return data.assignments
        .map((a) => ({
          cardId: a.cardId,
          tags: a.tags
            .map(normalizeTagName)
            .filter((t) => t.length > 0),
        }))
        .filter((a) => a.tags.length > 0);
    }
  } catch {
    // Fall through to text-based fallback
  }

  // Fallback: use generateText and parse JSON manually
  try {
    const { text } = await generateText({
      model,
      prompt,
      abortSignal,
      maxOutputTokens: 4096,
    });

    // Try to extract JSON
    const cleaned = text.trim();
    let jsonStr = cleaned;

    // Strip markdown code fences
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
    }

    // Try parsing as JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to find a JSON object with assignments
      const match = jsonStr.match(/\{[\s\S]*"assignments"[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    if (parsed && typeof parsed === "object" && "assignments" in (parsed as Record<string, unknown>)) {
      const data = parsed as { assignments: Array<{ cardId: number; tags: string[] }> };
      if (Array.isArray(data.assignments)) {
        return data.assignments
          .map((a) => ({
            cardId: a.cardId,
            tags: (a.tags ?? [])
              .map(normalizeTagName)
              .filter((t) => t.length > 0),
          }))
          .filter((a) => a.tags.length > 0);
      }
    }
  } catch {
    // Both methods failed
  }

  return [];
}

export async function tagCardsWithAI(options: {
  provider: AiProvider;
  cards: Card[];
  existingTags: Tag[];
  batchSize?: number;
  onProgress?: (progress: TaggerProgress) => void;
  abortSignal?: AbortSignal;
}): Promise<TaggerResult[]> {
  const {
    provider,
    cards,
    existingTags,
    batchSize = 15,
    onProgress,
    abortSignal,
  } = options;

  if (cards.length === 0) return [];

  const existingTagNames = existingTags.map((t) => t.name);

  onProgress?.({
    phase: "preparing",
    current: 0,
    total: cards.length,
    message: `Preparing ${cards.length} cards for tagging...`,
  });

  // Split cards into batches
  const batches: Card[][] = [];
  for (let i = 0; i < cards.length; i += batchSize) {
    batches.push(cards.slice(i, i + batchSize));
  }

  const model = createModel(provider);
  const allResults: TaggerResult[] = [];
  let failedBatches = 0;

  for (let i = 0; i < batches.length; i++) {
    // Check cancellation
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const batch = batches[i];
    onProgress?.({
      phase: `batch-${i + 1}/${batches.length}`,
      current: i + 1,
      total: batches.length,
      message: `Processing batch ${i + 1}/${batches.length} (${batch.length} cards)...`,
    });

    try {
      const batchResults = await attemptTagging(
        model,
        batch,
        existingTagNames,
        abortSignal,
      );
      allResults.push(...batchResults);

      // Add newly created tags to existing set for subsequent batches
      for (const r of batchResults) {
        for (const tag of r.tags) {
          if (!existingTagNames.includes(tag)) {
            existingTagNames.push(tag);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      failedBatches++;
      console.error(`Batch ${i + 1} failed:`, err);
    }

    // Delay between batches to avoid rate limits
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  onProgress?.({
    phase: "done",
    current: batches.length,
    total: batches.length,
    message:
      failedBatches > 0
        ? `Tagging complete. ${failedBatches} batch(es) failed.`
        : `Tagged ${allResults.length} cards.`,
  });

  if (failedBatches > 0 && allResults.length === 0) {
    throw new Error("All tagging batches failed. Check the AI provider configuration.");
  }

  return allResults;
}
