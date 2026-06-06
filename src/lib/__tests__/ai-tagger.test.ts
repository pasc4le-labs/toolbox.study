import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeTagName,
  buildBatchPrompt,
  tagCardsWithAI,
  type TaggerProgress,
} from "@/lib/ai-tagger";
import type { Card, AiProvider, Tag } from "@/db/schema";

// Mock the AI SDK so we never hit the network
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: vi.fn((s: unknown) => s),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => ({
    chatModel: vi.fn(() => "mock-model"),
  })),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mock-google-model")),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => ({
    languageModel: vi.fn(() => "mock-anthropic-model"),
  })),
}));

import { generateObject, generateText } from "ai";

const mockProvider: AiProvider = {
  id: 1,
  name: "Test Provider",
  providerType: "openai-compatible",
  baseUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  modelId: "test-model",
  isDefault: false,
  createdAt: 0,
};

function makeCard(id: number, front: string, back: string): Card {
  return {
    id,
    type: "knowledge",
    front,
    back,
    explanation: null,
    options: null,
    correctIndices: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("normalizeTagName", () => {
  it("trims whitespace", () => {
    expect(normalizeTagName("  hello  ")).toBe("hello");
  });

  it("lowercases", () => {
    expect(normalizeTagName("Biology")).toBe("biology");
  });

  it("replaces spaces with hyphens", () => {
    expect(normalizeTagName("cell structure")).toBe("cell-structure");
  });

  it("removes non-alphanumeric chars except hyphens", () => {
    expect(normalizeTagName("bio@#logy!")).toBe("biology");
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(normalizeTagName("a---b")).toBe("a-b");
  });

  it("removes leading and trailing hyphens", () => {
    expect(normalizeTagName("-hello-")).toBe("hello");
  });

  it("returns empty string for input that normalizes to nothing", () => {
    expect(normalizeTagName("@@@")).toBe("");
  });

  it("handles mixed transformations in one call", () => {
    expect(normalizeTagName("  Cell Bio 101!  ")).toBe("cell-bio-101");
  });

  it("preserves digits", () => {
    expect(normalizeTagName("topic 2 second edition")).toBe("topic-2-second-edition");
  });
});

describe("buildBatchPrompt", () => {
  it("includes card front and back text", () => {
    const cards = [makeCard(1, "Q1", "A1")];
    const prompt = buildBatchPrompt(cards, []);
    expect(prompt).toContain("Card ID: 1");
    expect(prompt).toContain("Front: Q1");
    expect(prompt).toContain("Back: A1");
  });

  it("truncates front and back to 500 chars", () => {
    const longFront = "F".repeat(1000);
    const longBack = "B".repeat(1000);
    const cards = [makeCard(1, longFront, longBack)];
    const prompt = buildBatchPrompt(cards, []);
    // Should contain a 500-char slice, not 1000
    expect(prompt).toContain("F".repeat(500));
    expect(prompt).toContain("B".repeat(500));
    expect(prompt).not.toContain("F".repeat(501));
  });

  it("includes existing tag names when provided", () => {
    const cards = [makeCard(1, "Q", "A")];
    const prompt = buildBatchPrompt(cards, ["alpha", "beta", "gamma"]);
    expect(prompt).toContain("EXISTING TAGS");
    expect(prompt).toContain("alpha");
    expect(prompt).toContain("beta");
    expect(prompt).toContain("gamma");
  });

  it("uses 'No existing tags' message when tag list is empty", () => {
    const cards = [makeCard(1, "Q", "A")];
    const prompt = buildBatchPrompt(cards, []);
    expect(prompt).toContain("No existing tags");
  });

  it("prompt contains JSON structure instructions", () => {
    const cards = [makeCard(1, "Q", "A")];
    const prompt = buildBatchPrompt(cards, []);
    expect(prompt).toContain("assignments");
    expect(prompt).toContain("cardId");
    expect(prompt).toContain("tags");
  });

  it("includes all cards in the batch", () => {
    const cards = [
      makeCard(1, "Q1", "A1"),
      makeCard(2, "Q2", "A2"),
      makeCard(3, "Q3", "A3"),
    ];
    const prompt = buildBatchPrompt(cards, []);
    expect(prompt).toContain("Card ID: 1");
    expect(prompt).toContain("Card ID: 2");
    expect(prompt).toContain("Card ID: 3");
  });
});

describe("tagCardsWithAI", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
    vi.mocked(generateText).mockReset();
  });

  it("returns empty array for empty cards without calling AI", async () => {
    const onProgress = vi.fn();
    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [],
      existingTags: [],
      onProgress,
    });
    expect(result).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("throws AbortError when abortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      tagCardsWithAI({
        provider: mockProvider,
        cards: [makeCard(1, "Q", "A")],
        existingTags: [],
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns normalized results from generateObject", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        assignments: [
          { cardId: 1, tags: ["Biology", "cell structure", "BAD!@#"] },
          { cardId: 2, tags: ["math"] },
        ],
      },
    } as never);

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q1", "A1"), makeCard(2, "Q2", "A2")],
      existingTags: [],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      cardId: 1,
      tags: ["biology", "cell-structure", "bad"],
    });
    expect(result[1]).toEqual({ cardId: 2, tags: ["math"] });
  });

  it("falls back to generateText when generateObject throws", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("schema failed"));
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        assignments: [{ cardId: 1, tags: ["chem", "Organic!"] }],
      }),
    } as never);

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q", "A")],
      existingTags: [],
    });

    expect(result).toEqual([{ cardId: 1, tags: ["chem", "organic"] }]);
  });

  it("falls back to manual JSON extraction from text response", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("schema failed"));
    vi.mocked(generateText).mockResolvedValue({
      text: 'Here is the result:\n```json\n{"assignments":[{"cardId":1,"tags":["physics"]}]}\n```\nDone!',
    } as never);

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q", "A")],
      existingTags: [],
    });

    expect(result).toEqual([{ cardId: 1, tags: ["physics"] }]);
  });

  it("returns empty array when both generateObject and generateText fail", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("schema failed"));
    vi.mocked(generateText).mockRejectedValue(new Error("text failed"));

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q", "A")],
      existingTags: [],
    });

    expect(result).toEqual([]);
  });

  it("processes multiple batches when batchSize is smaller than total cards", async () => {
    const callCount = { count: 0 };
    vi.mocked(generateObject).mockImplementation((async () => {
      callCount.count++;
      // 15 cards per batch: first batch assigns tag 1, second assigns tag 2
      return {
        object: {
          assignments: Array.from({ length: 15 }, (_, i) => ({
            cardId: callCount.count === 1 ? i + 1 : i + 16,
            tags: [`tag-batch-${callCount.count}`],
          })),
        },
      };
    }) as never);

    const cards: Card[] = Array.from({ length: 30 }, (_, i) =>
      makeCard(i + 1, `Q${i + 1}`, `A${i + 1}`),
    );

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards,
      existingTags: [],
      batchSize: 15,
    });

    expect(callCount.count).toBe(2);
    expect(result).toHaveLength(30);
  });

  it("calls onProgress with phase, current, total, message for each batch", async () => {
    const onProgress = vi.fn();
    vi.mocked(generateObject).mockResolvedValue({
      object: { assignments: [{ cardId: 1, tags: ["x"] }] },
    } as never);

    await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q", "A")],
      existingTags: [],
      onProgress,
    });

    // Should have at least: preparing, batch-1/1, done
    const phases = onProgress.mock.calls.map((c) => c[0]?.phase as string);
    expect(phases[0]).toBe("preparing");
    expect(phases).toContain("batch-1/1");
    expect(phases[phases.length - 1]).toBe("done");
  });

  it("onProgress payload includes current, total, message", async () => {
    const onProgress = vi.fn();
    vi.mocked(generateObject).mockResolvedValue({
      object: { assignments: [] },
    } as never);

    await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q", "A")],
      existingTags: [],
      onProgress,
    });

    const preparingCall = onProgress.mock.calls.find(
      (c) => c[0]?.phase === "preparing",
    )?.[0] as TaggerProgress | undefined;
    expect(preparingCall?.current).toBe(0);
    expect(preparingCall?.total).toBe(1);
    expect(preparingCall?.message).toContain("1 cards");
  });

  it("filters out assignments where all tags normalize to empty", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        assignments: [
          { cardId: 1, tags: ["valid"] },
          { cardId: 2, tags: ["@@@", "###"] },
        ],
      },
    } as never);

    const result = await tagCardsWithAI({
      provider: mockProvider,
      cards: [makeCard(1, "Q1", "A1"), makeCard(2, "Q2", "A2")],
      existingTags: [],
    });

    // Card 2's tags all normalize to "" so its assignment is dropped
    expect(result).toEqual([{ cardId: 1, tags: ["valid"] }]);
  });
});
