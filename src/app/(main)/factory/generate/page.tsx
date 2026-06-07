"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  RiMagicLine,
  RiAddLine,
  RiDeleteBinLine,
  RiAttachmentLine,
  RiCloseLine,
  RiFileLine,
  RiImageLine,
  RiCodeLine,
} from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { RenderLatex } from "@/components/render-latex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDb } from "@/db";
import {
  getAllAiProviders,
  createCard,
  getAllTags,
  getAllBundles,
  getOrCreateTag,
  addCardsToBundle,
} from "@/lib/services";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, jsonSchema } from "ai";
import { toast } from "sonner";

type CardType = "multi_radio" | "multi_select" | "open" | "knowledge";

interface GeneratedCard {
  type: CardType;
  front: string;
  back: string;
  explanation: string | null;
  options?: string[];
  correctIndices?: number[];
  tags?: string[];
}

interface AttachedFile {
  file: File;
  data: Uint8Array;
  preview?: string;
}

const cardSchema = jsonSchema<GeneratedCard>(
  {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["multi_radio", "multi_select", "open", "knowledge"],
      },
      front: { type: "string" },
      back: { type: "string" },
      explanation: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      options: { type: "array", items: { type: "string" } },
      correctIndices: { type: "array", items: { type: "integer" } },
    },
    required: ["type", "front", "back"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (!value || typeof value !== "object") {
        return { success: false, error: new Error("Expected object") };
      }
      const v = value as Record<string, unknown>;
      if (
        v.type !== "multi_radio" &&
        v.type !== "multi_select" &&
        v.type !== "open" &&
        v.type !== "knowledge"
      ) {
        return { success: false, error: new Error("Invalid card type") };
      }
      if (typeof v.front !== "string" || typeof v.back !== "string") {
        return { success: false, error: new Error("Missing front or back") };
      }
      return { success: true, value: value as GeneratedCard };
    },
  }
);

function normalizeCardType(type: unknown): CardType {
  if (typeof type !== "string") return "knowledge";
  const t = type.toLowerCase().replace(/[_\s-]/g, "");
  if (t === "multiradio" || t === "multiplechoice" || t === "multichoice" || t === "singlechoice") return "multi_radio";
  if (t === "multiselect" || t === "multipleselect") return "multi_select";
  if (t === "open" || t === "openended" || t === "openanswer") return "open";
  if (t === "knowledge" || t === "fact" || t === "info") return "knowledge";
  return "knowledge";
}

interface ParseResult {
  cards: GeneratedCard[];
  diagnostics: string | null;
}

function parseCardsFromText(text: string): ParseResult {
  const cards: GeneratedCard[] = [];
  const errors: string[] = [];

  // 1. Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
  }

  const tryParseArray = (arr: unknown[]) => {
    const itemErrors: string[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") {
        itemErrors.push("Found non-object item in array");
        continue;
      }
      const raw = item as Record<string, unknown>;
      // Normalize type before validation
      const normalizedType = normalizeCardType(raw.type);
      const normalizedItem = { ...raw, type: normalizedType };
      const result = cardSchema.validate?.(normalizedItem);
      if (result && "success" in result && result.success) {
        cards.push(result.value as GeneratedCard);
      } else {
        const reason = result && "error" in result ? result.error?.message : "unknown validation error";
        const typeField = JSON.stringify(raw.type);
        const hasRequired = "front" in raw && "back" in raw;
        if (!hasRequired) {
          itemErrors.push(`Card missing required 'front' or 'back' fields (type: ${typeField})`);
        } else {
          itemErrors.push(`Card validation failed: ${reason} (type: ${typeField})`);
        }
      }
    }
    if (itemErrors.length > 0 && cards.length === 0) {
      errors.push(`Parsed ${arr.length} item(s) but none passed validation: ${itemErrors.join("; ")}`);
    } else if (itemErrors.length > 0) {
      errors.push(`${itemErrors.length} of ${arr.length} card(s) failed validation: ${itemErrors.join("; ")}`);
    }
  };

  // 2. Try to find a JSON array directly
  let arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) {
        tryParseArray(parsed);
        if (cards.length > 0) return { cards, diagnostics: errors.length > 0 ? errors.join("\n") : null };
      } else {
        errors.push("Found JSON array in response but it was not an array after parsing");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`JSON parse error in array match: ${msg}`);
    }
  }

  // 3. Try to find { "elements": [...] } wrapper
  arrMatch = cleaned.match(/"elements"\s*:\s*(\[[\s\S]*\])/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[1]);
      if (Array.isArray(parsed)) {
        tryParseArray(parsed);
        if (cards.length > 0) return { cards, diagnostics: errors.length > 0 ? errors.join("\n") : null };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`JSON parse error in elements wrapper: ${msg}`);
    }
  }

  // 4. Last resort: try to parse the whole text as JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      tryParseArray(parsed);
      if (cards.length > 0) return { cards, diagnostics: errors.length > 0 ? errors.join("\n") : null };
    } else if (parsed && typeof parsed === "object" && "elements" in parsed) {
      const arr = (parsed as Record<string, unknown>).elements;
      if (Array.isArray(arr)) {
        tryParseArray(arr);
        if (cards.length > 0) return { cards, diagnostics: errors.length > 0 ? errors.join("\n") : null };
      }
    } else {
      errors.push(`AI returned valid JSON but it was not an array (type: ${Array.isArray(parsed) ? "array" : typeof parsed})`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`AI response is not valid JSON: ${msg}`);
  }

  return { cards, diagnostics: errors.length > 0 ? errors.join("\n") : "AI response could not be parsed — no JSON array found" };
}

export default function GeneratePage() {
  const [providers, setProviders] = useState<
    Awaited<ReturnType<typeof getAllAiProviders>>
  >([]);
  const [tags, setTags] = useState<Awaited<ReturnType<typeof getAllTags>>>([]);
  const [bundles, setBundles] = useState<
    Awaited<ReturnType<typeof getAllBundles>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [content, setContent] = useState("");
  const [providerId, setProviderId] = useState<string>("");
  const [cardType, setCardType] = useState<CardType>("knowledge");
  const [tagInput, setTagInput] = useState("");
  const [targetBundleId, setTargetBundleId] = useState<string>("none");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Streaming state
  const [showRaw, setShowRaw] = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const rawTextRef = useRef("");

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [p, t, b] = await Promise.all([
          getAllAiProviders(db),
          getAllTags(db),
          getAllBundles(db),
        ]);
        setProviders(p);
        setTags(t);
        setBundles(b);

        // Auto-select default provider
        const defaultP = p.find((pr) => pr.isDefault);
        if (defaultP) setProviderId(defaultP.id.toString());
        else if (p.length > 0) setProviderId(p[0].id.toString());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];

    for (const file of Array.from(files)) {
      const data = await file.arrayBuffer();
      const uint8 = new Uint8Array(data);
      const isImage = file.type.startsWith("image/");
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      newFiles.push({ file, data: uint8, preview });
    }

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleGenerate = async () => {
    if (!content.trim() && attachedFiles.length === 0) {
      toast.error("Please enter source content or attach files");
      return;
    }
    if (!providerId) {
      toast.error("Please select an AI provider");
      return;
    }
    setGenerating(true);
    setGeneratedCards([]);
    setStreamingRaw("");
    rawTextRef.current = "";

    try {
      const provider = providers.find((p) => p.id.toString() === providerId);
      if (!provider) throw new Error("Provider not found");

      const providerType = (provider.providerType ?? "openai-compatible") as
        | "openai-compatible"
        | "google"
        | "anthropic";

      // Normalize model ID (strip Google models/ prefix if present)
      const modelId = provider.modelId.replace(/^models\//, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let model: any;
      switch (providerType) {
        case "google": {
          const googleProvider = createGoogleGenerativeAI({
            apiKey: provider.apiKey ?? undefined,
          });
          model = googleProvider(modelId);
          break;
        }
        case "anthropic": {
          const anthropicProvider = createAnthropic({
            apiKey: provider.apiKey ?? undefined,
          });
          model = anthropicProvider.languageModel(modelId);
          break;
        }
        case "openai-compatible":
        default: {
          const compatibleProvider = createOpenAICompatible({
            name: provider.name,
            apiKey: provider.apiKey ?? undefined,
            baseURL: provider.baseUrl,
          });
          model = compatibleProvider.chatModel(modelId);
          break;
        }
      }

      const promptText = `You are a flashcard generator. Analyze the provided source material and generate an appropriate number of ${cardType} flashcards that thoroughly cover the key concepts.

CRITICAL: For the "type" field, you MUST use one of these EXACT values:
- "knowledge" — fact-based recall cards
- "open" — open-ended question/answer cards
- "multi_radio" — multiple choice with exactly ONE correct answer
- "multi_select" — multiple choice with possibly MULTIPLE correct answers

For each flashcard, output a JSON object with EXACTLY these fields:
- type: MUST be "${cardType}" (use this exact string, no variations)
- front: string (the question or prompt shown to the user)
- back: string (the answer or main content)
- explanation: string or null (optional extra explanation)
- tags: string[] (relevant topic tags)
- options: string[] or null (only for multi_radio/multi_select — possible answer choices)
- correctIndices: number[] or null (only for multi_radio/multi_select — 0-based indices of correct options)

Example card (knowledge type):
{
  "type": "knowledge",
  "front": "What is the powerhouse of the cell?",
  "back": "Mitochondria",
  "explanation": "Mitochondria produce ATP through cellular respiration.",
  "tags": ["biology", "cell-biology"],
  "options": null,
  "correctIndices": null
}

Example card (multi_radio type):
{
  "type": "multi_radio",
  "front": "What is 2 + 2?",
  "back": "4",
  "explanation": null,
  "tags": ["math", "arithmetic"],
  "options": ["3", "4", "5", "6"],
  "correctIndices": [1]
}

Output ONLY a single JSON array of card objects. No markdown code fences, no explanations, no text outside the JSON array. Let the depth and density of the source material guide how many cards you create.

${content.trim() ? `Source material:\n${content}\n` : ""}
${attachedFiles.length > 0 ? `${attachedFiles.length} file(s) are attached for your analysis.` : ""}`;

      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: Uint8Array | ArrayBuffer; mediaType: string; filename?: string }
      > = [{ type: "text", text: promptText }];

      for (const af of attachedFiles) {
        userContent.push({
          type: "file",
          data: af.data,
          mediaType: af.file.type || "application/octet-stream",
          filename: af.file.name,
        });
      }

      const result = streamText({
        model,
        system:
          'You are a flashcard generator. You MUST respond with ONLY a JSON array. No markdown, no explanations, no text outside the JSON.',
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
        maxOutputTokens: 4096,
        onChunk: ({ chunk }) => {
          if (chunk.type === "text-delta") {
            rawTextRef.current += chunk.text;
            setStreamingRaw(rawTextRef.current);
          }
        },
        onError: (event) => {
          console.error("Stream error:", event.error);
        },
      });

      const text = await result.text;
      const { cards, diagnostics } = parseCardsFromText(text);
      if (cards.length === 0) {
        // Auto-show raw output so the user can inspect what came back
        setShowRaw(true);
        const diag = diagnostics ?? "No valid cards could be extracted from the AI response.";
        throw new Error(`No valid flashcards generated.\n\n${diag}`);
      }
      setGeneratedCards(cards);
      if (diagnostics) {
        toast.warning(`Generated ${cards.length} cards with some issues: ${diagnostics}`);
      } else {
        toast.success(`Generated ${cards.length} cards`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to generate cards";
      toast.error(message, {
        duration: 8000,
        description: "Check the raw output below for details.",
      });
      // Ensure raw output is visible when there's an error
      setShowRaw(true);
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAll = async () => {
    if (generatedCards.length === 0) return;
    setSaving(true);

    try {
      const { db } = await getDb();
      const userTagNames = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const bundleId =
        targetBundleId && targetBundleId !== "none"
          ? parseInt(targetBundleId)
          : null;
      const savedIds: number[] = [];

      for (const card of generatedCards) {
        const allTagNames = Array.from(
          new Set([...(card.tags ?? []), ...userTagNames])
        );
        const tagIds: number[] = [];

        for (const name of allTagNames) {
          const tag = await getOrCreateTag(db, name);
          if (tag) tagIds.push(tag.id);
        }

        const saved = await createCard(db, {
          type: card.type,
          front: card.front,
          back: card.back,
          explanation: card.explanation,
          options: card.options ?? null,
          correctIndices: card.correctIndices ?? null,
          tagIds,
          bundleIds: bundleId ? [bundleId] : [],
        });
        savedIds.push(saved.id);
      }

      toast.success(`Saved ${savedIds.length} cards`);
      setGeneratedCards([]);
      setContent("");
      setAttachedFiles((prev) => {
        prev.forEach((af) => {
          if (af.preview) URL.revokeObjectURL(af.preview);
        });
        return [];
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save cards");
    } finally {
      setSaving(false);
    }
  };

  const removeGeneratedCard = (idx: number) => {
    setGeneratedCards((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <Boxed className="py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Boxed>
    );
  }

  return (
    <Boxed className="py-8">
      <div className="mb-6">
        <PageTitle>Generate</PageTitle>
        <h1 className="text-3xl font-bold tracking-tight">Generate Flashcards</h1>
        <p className="mt-1 text-muted-foreground">
          Use AI to create flashcards from your content
        </p>
      </div>

      {providers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">
              No AI providers configured. Add a provider first.
            </p>
            <Button asChild>
              <Link href="/factory">
                <RiAddLine className="mr-2 h-4 w-4" />
                Configure Provider
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Source content */}
          <div className="space-y-2">
            <Label htmlFor="content">Source Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your study material, notes, or any content you want to turn into flashcards..."
              rows={8}
            />
          </div>

          {/* File attachments */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>File Sources (optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <RiAttachmentLine className="mr-1 h-4 w-4" />
                Attach files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {attachedFiles.map((af, i) => (
                  <div
                    key={i}
                    className="relative flex items-center gap-2 rounded-lg border bg-muted/50 p-2 pr-8"
                  >
                    {af.preview ? (
                      <img
                        src={af.preview}
                        alt={af.file.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : af.file.type.startsWith("image/") ? (
                      <RiImageLine className="h-8 w-8 text-muted-foreground" />
                    ) : (
                      <RiFileLine className="h-8 w-8 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="max-w-[200px] truncate text-sm font-medium">
                        {af.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(af.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(i)}
                      className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RiCloseLine className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Config row */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.modelId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Card Type</Label>
              <Select
                value={cardType}
                onValueChange={(v) => setCardType(v as CardType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="knowledge">Knowledge</SelectItem>
                  <SelectItem value="open">Open Answer</SelectItem>
                  <SelectItem value="multi_radio">
                    Multiple Choice (Single)
                  </SelectItem>
                  <SelectItem value="multi_select">
                    Multiple Choice (Multi)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target Bundle (Optional)</Label>
              <Select value={targetBundleId} onValueChange={setTargetBundleId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {bundles.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (comma-separated, optional)</Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. biology, chapter-5, mitochondria"
            />
          </div>

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={generating} size="lg">
            <RiMagicLine className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate Cards"}
          </Button>

          {/* Streaming / Generated cards preview */}
          {(generatedCards.length > 0 || generating) && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    {generating
                      ? `Generating... (${generatedCards.length})`
                      : `Generated Cards (${generatedCards.length})`}
                  </h2>
                  {generating && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    <RiCodeLine className="mr-1 h-4 w-4" />
                    {showRaw ? "Hide raw" : "Raw output"}
                  </Button>
                  {!generating && (
                    <>
                      <Button onClick={handleSaveAll} disabled={saving} size="sm">
                        {saving ? "Saving..." : "Save All"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGeneratedCards([])}
                      >
                        Discard
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Raw output panel */}
              {showRaw && (
                <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
                  <pre className="max-h-48 text-xs text-muted-foreground">
                    <code>{streamingRaw || "Waiting for output..."}</code>
                  </pre>
                </div>
              )}

              <div className="space-y-3">
                {generatedCards.map((card, i) => (
                  <Card
                    key={i}
                    className="group transition-shadow hover:shadow-md"
                  >
                    <CardContent className="py-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{i + 1}</Badge>
                          <Badge>{card.type.replace("_", " ")}</Badge>
                          {card.tags && card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {card.tags.map((t) => (
                                <Badge
                                  key={t}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {!generating && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeGeneratedCard(i)}
                          >
                            <RiDeleteBinLine className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Front — always visible */}
                      <div className="mb-1 font-medium"><RenderLatex content={card.front} /></div>

                      <div className="text-sm text-muted-foreground">
                        <div><RenderLatex content={card.back} /></div>
                        {card.explanation && (
                          <p className="mt-1 text-xs">
                            <RenderLatex content={card.explanation} />
                          </p>
                        )}
                        {card.options && (
                          <div className="mt-2 space-y-1">
                            {card.options.map((opt, j) => (
                              <div
                                key={j}
                                className={`rounded border p-1 text-xs ${
                                  card.correctIndices?.includes(j)
                                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                    : ""
                                }`}
                              >
                                <RenderLatex content={opt} />
                                {card.correctIndices?.includes(j) && (
                                  <Badge className="ml-1 bg-green-600 text-xs">
                                    Correct
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {generating && generatedCards.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
                    <div className="text-center">
                      <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="mt-2 text-sm">Waiting for first card...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Boxed>
  );
}
