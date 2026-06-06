"use client";

import { useState, useEffect, useRef } from "react";
import {
  RiUploadLine,
  RiFileLine,
  RiCheckLine,
  RiArrowDownLine,
  RiDownloadLine,
} from "@remixicon/react";
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
import { parseSqt, type SqtCard } from "@/lib/sqt-parser";
import { toast } from "sonner";

type ImportMode = "json" | "sqt";

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

  // SQT import state
  const [sqtCards, setSqtCards] = useState<SqtCard[]>([]);
  const [sqtErrors, setSqtErrors] = useState<string[]>([]);
  const [sqtTargetBundleId, setSqtTargetBundleId] = useState<string>("none");

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

  const resetSqtState = () => {
    setSqtCards([]);
    setSqtErrors([]);
    setSqtTargetBundleId("none");
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

  // ─── SQT Import ───

  const handleSqtFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { cards, errors } = parseSqt(text);
      resetSqtState();
      setSqtCards(cards);
      setSqtErrors(errors);

      if (cards.length === 0) {
        toast.error("No valid questions found in the SQT file");
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

  const handleSqtImport = async () => {
    if (sqtCards.length === 0) {
      toast.error("No cards to import");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      const bundleId = sqtTargetBundleId !== "none" ? parseInt(sqtTargetBundleId) : null;
      let count = 0;

      for (const cardData of sqtCards) {
        const card = await createCard(db, {
          type: "multi_radio",
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
      resetSqtState();
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
        <h1 className="text-3xl font-bold tracking-tight">Import</h1>
        <p className="mt-1 text-muted-foreground">
          Import flashcards from JSON or SQT (Simple Question Text) files
        </p>
      </div>

      {/* Mode tabs */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={mode === "json" ? "default" : "outline"}
          onClick={() => { setMode("json"); resetJsonState(); resetSqtState(); }}
        >
          <RiFileLine className="mr-2 h-4 w-4" />
          JSON Import
        </Button>
        <Button
          variant={mode === "sqt" ? "default" : "outline"}
          onClick={() => { setMode("sqt"); resetJsonState(); resetSqtState(); }}
        >
          <RiArrowDownLine className="mr-2 h-4 w-4" />
          SQT Import
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
                        <div className="flex items-center gap-2">
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

      {mode === "sqt" && (
        <div className="space-y-6">
          {/* SQT file upload */}
          <div className="space-y-2">
            <Label>SQT File (Simple Question Text)</Label>
            <p className="text-sm text-muted-foreground">
              Upload a plain-text file where each exercise follows the SQT format:
            </p>
            <pre className="mt-2 rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">{`Esercizio 1.
Question text goes here
A) First option
B) Second option
C) Third option
Risposta: A
Commento: Optional explanation`}</pre>
            <ul className="mt-3 ml-4 list-disc text-sm text-muted-foreground">
              <li>Each exercise starts with <code className="bg-muted px-1 rounded">Esercizio N.</code> on its own line</li>
              <li>Followed by the question text (can span multiple lines)</li>
              <li>Options are lettered <code className="bg-muted px-1 rounded">A)</code> through <code className="bg-muted px-1 rounded">D)</code> (or more), one per line</li>
              <li><code className="bg-muted px-1 rounded">Risposta:</code> gives the correct letter (e.g. <code className="bg-muted px-1 rounded">Risposta: A</code>)</li>
              <li><code className="bg-muted px-1 rounded">Commento:</code> is optional and adds an explanation to the card</li>
              <li>All cards are imported as <strong>multi_radio</strong> (single-answer multiple choice)</li>
            </ul>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <RiUploadLine className="mr-2 h-4 w-4" />
              Choose SQT File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={handleSqtFile}
            />
          </div>

          {sqtErrors.length > 0 && (
            <Card className="border-yellow-500">
              <CardContent className="py-4">
                <h4 className="mb-2 text-sm font-semibold text-yellow-600">
                  Parsing Warnings ({sqtErrors.length})
                </h4>
                <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
                  {sqtErrors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Parsed SQT preview */}
          {sqtCards.length > 0 && (
            <>
              <div className="space-y-2">
                <Label>Target Bundle</Label>
                <Select value={sqtTargetBundleId} onValueChange={setSqtTargetBundleId}>
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
                  Parsed Questions ({sqtCards.length})
                </h3>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {sqtCards.map((card, i) => (
                    <Card key={i} className="transition-shadow hover:shadow-md">
                      <CardContent className="py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary">{i + 1}</Badge>
                          <Badge>multi_radio</Badge>
                        </div>
                        <p className="mb-1 text-sm font-medium">{card.front}</p>
                        {card.options && (
                          <div className="space-y-1">
                            {card.options.map((opt, j) => (
                              <div
                                key={j}
                                className={`rounded border p-1 text-xs ${
                                  card.correctIndices.includes(j)
                                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                    : ""
                                }`}
                              >
                                <span className="mr-1 font-bold">{String.fromCharCode(65 + j)})</span>
                                {opt}
                                {card.correctIndices.includes(j) && (
                                  <Badge className="ml-1 bg-green-600 text-xs">✓</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {card.explanation && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {card.explanation}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Button onClick={handleSqtImport} disabled={saving} size="lg">
                <RiCheckLine className="mr-2 h-4 w-4" />
                {saving ? "Importing..." : `Import ${sqtCards.length} Cards`}
              </Button>
            </>
          )}
        </div>
      )}
    </Boxed>
  );
}