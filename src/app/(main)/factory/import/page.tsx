"use client";

import { useState, useEffect, useRef } from "react";
import {
  RiUploadLine,
  RiFileLine,
  RiCheckLine,
  RiArrowDownLine,
  RiDownloadLine,
  RiDiamondLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  getAllBundles,
  createCard,
  createBundle,
  getOrCreateTag,
  addCardsToBundle,
} from "@/lib/services";
import { parseUqf, type UqfCard } from "@/lib/uqf-parser";
import { toast } from "sonner";

type ImportMode = "json" | "uqf";

const CARD_TYPE_LABELS: Record<UqfCard["type"], string> = {
  open: "Open",
  multi_radio: "Multiple Choice",
  multi_select: "Multi-Select",
};

function parseJsonField<T>(val: string | T | null | undefined): T | null {
  if (val == null) return null;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return val as T;
}

interface ParsedJsonCard {
  type: string;
  front: string;
  back: string;
  explanation?: string | null;
  options?: string[] | string | null;
  correctIndices?: number[] | string | null;
  tags?: string[];
  tagNames?: string[];
}

interface ParsedJsonBundle {
  title: string;
  description?: string | null;
  cards: ParsedJsonCard[];
}

interface ParsedJsonData {
  cards?: ParsedJsonCard[];
  bundles?: ParsedJsonBundle[];
}

export default function ImportPage() {
  const [mode, setMode] = useState<ImportMode>("json");
  const [bundles, setBundles] = useState<Awaited<ReturnType<typeof getAllBundles>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // JSON import state
  const [jsonCards, setJsonCards] = useState<ParsedJsonCard[]>([]);
  const [jsonBundles, setJsonBundles] = useState<ParsedJsonBundle[]>([]);
  const [jsonTargetBundleId, setJsonTargetBundleId] = useState<string>("none");
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  // UQF import state
  const [uqfCards, setUqfCards] = useState<UqfCard[]>([]);
  const [uqfErrors, setUqfErrors] = useState<string[]>([]);
  const [uqfWarnings, setUqfWarnings] = useState<string[]>([]);
  const [uqfTargetBundleId, setUqfTargetBundleId] = useState<string>("none");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const b = await getAllBundles(db);
        setBundles(b);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadRef.current = load;
    load();
  }, []);

  const resetJsonState = () => {
    setJsonCards([]);
    setJsonBundles([]);
    setJsonParseError(null);
    setJsonTargetBundleId("none");
  };

  const resetUqfState = () => {
    setUqfCards([]);
    setUqfErrors([]);
    setUqfWarnings([]);
    setUqfTargetBundleId("none");
  };

  // ─── JSON Import ───

  const handleJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text) as ParsedJsonData;
        resetJsonState();

        const cards: ParsedJsonCard[] = [];
        const bundles: ParsedJsonBundle[] = [];

        // Accept { cards: [...] } or { cards: [...], bundles: [...] }
        if (Array.isArray(data)) {
          // Top-level array: treat as cards
          for (const item of data) {
            if (item && typeof item === "object") {
              if ("title" in item && "cards" in item && Array.isArray((item as ParsedJsonBundle).cards)) {
                bundles.push(item as ParsedJsonBundle);
              } else if ("front" in item) {
                cards.push(item as ParsedJsonCard);
              }
            }
          }
        } else if (data && typeof data === "object") {
          if (Array.isArray(data.cards)) {
            cards.push(...data.cards);
          }
          if (Array.isArray(data.bundles)) {
            bundles.push(...data.bundles);
          }
        }

        if (cards.length === 0 && bundles.length === 0) {
          setJsonParseError("No cards or bundles found in the JSON file. Expected { cards: [...] } or { bundles: [{ title, cards: [...] }] }.");
          return;
        }

        setJsonCards(cards);
        setJsonBundles(bundles);
        toast.success(`Parsed ${cards.length} cards and ${bundles.length} bundles`);
      } catch (err) {
        setJsonParseError(`Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleJsonImport = async () => {
    setSaving(true);
    try {
      const { db } = await getDb();
      let count = 0;
      const bundleId = jsonTargetBundleId !== "none" ? parseInt(jsonTargetBundleId) : null;

      // Import standalone cards
      for (const cardData of jsonCards) {
        const tagIds: number[] = [];
        for (const tagName of (cardData.tags ?? cardData.tagNames ?? [])) {
          const tag = await getOrCreateTag(db, tagName);
          tagIds.push(tag.id);
        }

        await createCard(db, {
          type: (["multi_radio", "multi_select", "open", "knowledge"].includes(cardData.type)
            ? cardData.type
            : "knowledge") as "multi_radio" | "multi_select" | "open" | "knowledge",
          front: cardData.front,
          back: cardData.back,
          explanation: cardData.explanation ?? null,
          options: parseJsonField<string[]>(cardData.options),
          correctIndices: parseJsonField<number[]>(cardData.correctIndices),
          tagIds,
          bundleIds: bundleId ? [bundleId] : [],
        });

        count++;
      }

      // Import bundles (with embedded cards)
      for (const bundleData of jsonBundles) {
        const newBundle = await createBundle(db, {
          title: bundleData.title,
          description: bundleData.description ?? null,
        });

        for (const cardData of bundleData.cards) {
          const tagIds: number[] = [];
          for (const tagName of (cardData.tags ?? cardData.tagNames ?? [])) {
            const tag = await getOrCreateTag(db, tagName);
            tagIds.push(tag.id);
          }

          await createCard(db, {
            type: (["multi_radio", "multi_select", "open", "knowledge"].includes(cardData.type)
              ? cardData.type
              : "knowledge") as "multi_radio" | "multi_select" | "open" | "knowledge",
            front: cardData.front,
            back: cardData.back,
            explanation: cardData.explanation ?? null,
            options: parseJsonField<string[]>(cardData.options),
            correctIndices: parseJsonField<number[]>(cardData.correctIndices),
            tagIds,
            bundleIds: [newBundle.id],
          });
          count++;
        }
      }

      toast.success(`Imported ${count} cards`);
      resetJsonState();
      await loadRef.current?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── UQF Import ───

  const handleUqfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { cards, errors, warnings } = parseUqf(text);
      resetUqfState();
      setUqfCards(cards);
      setUqfErrors(errors);
      setUqfWarnings(warnings);

      if (cards.length === 0) {
        toast.error("No valid questions found in the UQF file");
      } else {
        toast.success(`Parsed ${cards.length} questions`);
        if (errors.length > 0) {
          toast.warning(`${errors.length} exercises had parsing issues`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleUqfImport = async () => {
    if (uqfCards.length === 0) {
      toast.error("No cards to import");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      const bundleId = uqfTargetBundleId !== "none" ? parseInt(uqfTargetBundleId) : null;
      let count = 0;

      for (const cardData of uqfCards) {
        await createCard(db, {
          type: cardData.type,
          front: cardData.front,
          back: cardData.back,
          explanation: cardData.explanation,
          options: cardData.options,
          correctIndices: cardData.correctIndices,
          tagIds: [],
          bundleIds: bundleId ? [bundleId] : [],
        });
        count++;
      }

      toast.success(`Imported ${count} cards`);
      resetUqfState();
      await loadRef.current?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
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
        <PageTitle>Import</PageTitle>
        <h1 className="text-3xl font-bold tracking-tight">Import</h1>
        <p className="mt-1 text-muted-foreground">
          Import flashcards from JSON or UQF (Universal Quiz Format) text files
        </p>
      </div>

      {/* Mode tabs */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={mode === "json" ? "default" : "outline"}
          onClick={() => { setMode("json"); resetJsonState(); resetUqfState(); }}
        >
          <RiFileLine className="mr-2 h-4 w-4" />
          JSON Import
        </Button>
        <Button
          variant={mode === "uqf" ? "default" : "outline"}
          onClick={() => { setMode("uqf"); resetJsonState(); resetUqfState(); }}
        >
          <RiArrowDownLine className="mr-2 h-4 w-4" />
          UQF Import
        </Button>
      </div>

      {mode === "json" && (
        <div className="space-y-6">
          {/* JSON file upload */}
          <div className="space-y-2">
            <Label>JSON File</Label>
            <p className="text-sm text-muted-foreground">
              Upload a JSON file with cards and optionally bundles. Supported formats:
            </p>
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              <li><code className="bg-muted px-1 rounded">{"{ \"cards\": [...] }"}</code> — array of card objects</li>
              <li><code className="bg-muted px-1 rounded">{"{ \"cards\": [...], \"bundles\": [...] }"}</code> — cards + bundles</li>
              <li><code className="bg-muted px-1 rounded">{"[{ \"title\": \"...\", \"cards\": [...] }]"}</code> — bundles with embedded cards</li>
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <RiUploadLine className="mr-2 h-4 w-4" />
                Choose JSON File
              </Button>
              {process.env.NEXT_PUBLIC_GEMINI_JSON_GEM && (
                <Button asChild variant="ghost">
                  <a
                    href={process.env.NEXT_PUBLIC_GEMINI_JSON_GEM}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <RiDiamondLine className="mr-2 h-4 w-4" />
                    Gemini Gem
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = "/import-schema.json";
                  link.download = "import-schema.json";
                  link.click();
                }}
              >
                <RiDownloadLine className="mr-2 h-4 w-4" />
                Download Schema
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleJsonFile}
            />
          </div>

          {jsonParseError && (
            <Card className="border-destructive">
              <CardContent className="py-4 text-sm text-destructive">
                {jsonParseError}
              </CardContent>
            </Card>
          )}

          {/* Parsed JSON preview */}
          {(jsonCards.length > 0 || jsonBundles.length > 0) && (
            <>
              {/* Target bundle for standalone cards */}
              {jsonCards.length > 0 && (
                <div className="space-y-2">
                  <Label>Target Bundle for Standalone Cards</Label>
                  <Select value={jsonTargetBundleId} onValueChange={setJsonTargetBundleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="None (no bundle)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (no bundle)</SelectItem>
                      {bundles.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Preview of parsed cards */}
              {jsonCards.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    Standalone Cards ({jsonCards.length})
                  </h3>
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {jsonCards.slice(0, 20).map((card, i) => (
                      <Card key={i} className="py-2">
                        <CardContent className="py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{i + 1}</Badge>
                            <Badge>{card.type?.replace("_", " ") ?? "unknown"}</Badge>
                            <span className="truncate text-sm">{card.front}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {jsonCards.length > 20 && (
                      <p className="text-sm text-muted-foreground">
                        ... and {jsonCards.length - 20} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview of parsed bundles */}
              {jsonBundles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    Bundles ({jsonBundles.length})
                  </h3>
                  {jsonBundles.map((bundle, i) => (
                    <Card key={i}>
                      <CardContent className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{bundle.cards.length} cards</Badge>
                          <span className="font-medium">{bundle.title}</span>
                          {bundle.description && (
                            <span className="text-sm text-muted-foreground">
                              — {bundle.description}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Button onClick={handleJsonImport} disabled={saving} size="lg">
                <RiCheckLine className="mr-2 h-4 w-4" />
                {saving ? "Importing..." : `Import ${jsonCards.length + jsonBundles.reduce((s, b) => s + b.cards.length, 0)} Cards`}
              </Button>
            </>
          )}
        </div>
      )}

      {mode === "uqf" && (
        <div className="space-y-6">
          {/* UQF file upload */}
          <div className="space-y-2">
            <Label>UQF File (Universal Quiz Format)</Label>
            <p className="text-sm text-muted-foreground">
              Upload a plain-text or Markdown file with questions in the UQF format.
              UQF is a strict superset of the legacy SQT format — legacy SQT files
              are still imported correctly as <code className="bg-muted px-1 rounded">multi_radio</code> cards.
            </p>
            <pre className="mt-2 rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">{`Esercizio 1.
Question text goes here
A) First option
B) Second option
C) Third option
Risposta: A
Commento: Optional explanation`}</pre>
            <ul className="mt-3 ml-4 list-disc text-sm text-muted-foreground">
              <li><strong>Legacy SQT:</strong> <code className="bg-muted px-1 rounded">Esercizio N.</code> + <code className="bg-muted px-1 rounded">Risposta:</code> + <code className="bg-muted px-1 rounded">Commento:</code></li>
              <li><strong>Modern UQF:</strong> <code className="bg-muted px-1 rounded">Question:</code> / <code className="bg-muted px-1 rounded">Q:</code> for the question, <code className="bg-muted px-1 rounded">Answer:</code> / <code className="bg-muted px-1 rounded">Answers:</code> for the answer, <code className="bg-muted px-1 rounded">Explanation:</code> / <code className="bg-muted px-1 rounded">Exp:</code> for the explanation</li>
              <li>Options are lettered <code className="bg-muted px-1 rounded">A)</code> through <code className="bg-muted px-1 rounded">D)</code> (or more)</li>
              <li>Single answer (e.g. <code className="bg-muted px-1 rounded">Answer: A</code>) → <strong>multi_radio</strong></li>
              <li>Multi-answer (e.g. <code className="bg-muted px-1 rounded">Answers: A, C</code>) → <strong>multi_select</strong></li>
              <li>No options between Question and Answer → <strong>open</strong> question (Answer is the full text)</li>
              <li>Use <code className="bg-muted px-1 rounded">---</code> on its own line to separate cards</li>
              <li>LLM-tolerant: <code className="bg-muted px-1 rounded">- A)</code>, <code className="bg-muted px-1 rounded">* B)</code>, <code className="bg-muted px-1 rounded">**A.**</code> all parse as the same option</li>
              <li>Multi-line questions, LaTeX (<code className="bg-muted px-1 rounded">$x^2$</code>), and Markdown are preserved verbatim</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <RiUploadLine className="mr-2 h-4 w-4" />
                Choose UQF File
              </Button>
              {process.env.NEXT_PUBLIC_GEMINI_UQF_GEM && (
                <Button asChild variant="ghost">
                  <a
                    href={process.env.NEXT_PUBLIC_GEMINI_UQF_GEM}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <RiDiamondLine className="mr-2 h-4 w-4" />
                    Gemini Gem
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost">
                <a href="/uqf-skill.md" target="_blank" rel="noopener noreferrer">
                  <RiExternalLinkLine className="mr-2 h-4 w-4" />
                  LLM Instructions
                </a>
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={handleUqfFile}
            />
          </div>

          {uqfErrors.length > 0 && (
            <Card className="border-yellow-500">
              <CardContent className="py-4">
                <h4 className="mb-2 text-sm font-semibold text-yellow-600">
                  Parsing Warnings ({uqfErrors.length})
                </h4>
                <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
                  {uqfErrors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {uqfWarnings.length > 0 && (
            <Card className="border-blue-500">
              <CardContent className="py-4">
                <h4 className="mb-2 text-sm font-semibold text-blue-600">
                  Notes ({uqfWarnings.length})
                </h4>
                <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
                  {uqfWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Parsed UQF preview */}
          {uqfCards.length > 0 && (
            <>
              <div className="space-y-2">
                <Label>Target Bundle</Label>
                <Select value={uqfTargetBundleId} onValueChange={setUqfTargetBundleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None (no bundle)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (no bundle)</SelectItem>
                    {bundles.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>
                        {b.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  Parsed Questions ({uqfCards.length})
                </h3>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {uqfCards.map((card, i) => (
                    <Card key={i} className="transition-shadow hover:shadow-md">
                      <CardContent className="py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary">{i + 1}</Badge>
                          <Badge>{CARD_TYPE_LABELS[card.type]}</Badge>
                        </div>
                        <p className="mb-1 whitespace-pre-wrap text-sm font-medium">{card.front}</p>
                        {card.options && card.options.length > 0 && (
                          <div className="space-y-1">
                            {card.options.map((opt, j) => {
                              const isCorrect = card.correctIndices?.includes(j) ?? false;
                              return (
                                <div
                                  key={j}
                                  className={`rounded border p-1 text-xs ${
                                    isCorrect
                                      ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                      : ""
                                  }`}
                                >
                                  <span className="mr-1 font-bold">{String.fromCharCode(65 + j)})</span>
                                  <span className="whitespace-pre-wrap">{opt}</span>
                                  {isCorrect && (
                                    <Badge className="ml-1 bg-green-600 text-xs">✓</Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {card.type === "open" && card.back && (
                          <div className="mt-1 rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                            <span className="font-semibold">Answer:</span> {card.back}
                          </div>
                        )}
                        {card.explanation && (
                          <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
                            {card.explanation}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Button onClick={handleUqfImport} disabled={saving} size="lg">
                <RiCheckLine className="mr-2 h-4 w-4" />
                {saving ? "Importing..." : `Import ${uqfCards.length} Cards`}
              </Button>
            </>
          )}
        </div>
      )}
    </Boxed>
  );
}