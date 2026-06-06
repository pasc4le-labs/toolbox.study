"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  RiPriceTag3Line,
  RiAddLine,
  RiSearchLine,
  RiPlayCircleLine,
  RiStopCircleLine,
  RiCheckboxMultipleLine,
  RiCloseLine,
} from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  getAllBundles,
  getAllTags,
  getUntaggedCardsByBundle,
  getOrCreateTag,
  addTagsToCard,
} from "@/lib/services";
import {
  tagCardsWithAI,
  type TaggerResult,
  type TaggerProgress,
} from "@/lib/ai-tagger";
import { toast } from "sonner";
import type { Card as CardType, Tag, Bundle, AiProvider } from "@/db/schema";

export default function TaggerPage() {
  // ── Data ──
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Selection ──
  const [providerId, setProviderId] = useState<string>("");
  const [bundleId, setBundleId] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(15);

  // ── Untagged cards ──
  const [untaggedCards, setUntaggedCards] = useState<CardType[]>([]);
  const [scanning, setScanning] = useState(false);

  // ── Tagger run ──
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TaggerProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [results, setResults] = useState<TaggerResult[]>([]);

  // ── Apply ──
  const [applying, setApplying] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());

  // ── View mode ──
  const [viewMode, setViewMode] = useState<"card" | "tag">("card");

  const loadRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [p, b, t] = await Promise.all([
          getAllAiProviders(db),
          getAllBundles(db),
          getAllTags(db),
        ]);
        setProviders(p);
        setBundles(b);
        setAllTags(t);

        const defaultP = p.find((pr) => pr.isDefault);
        if (defaultP) setProviderId(defaultP.id.toString());
        else if (p.length > 0) setProviderId(p[0].id.toString());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadRef.current = load;
    load();
  }, []);

  // ── Scan for untagged cards ──
  const handleScan = useCallback(async () => {
    if (!bundleId) return;
    setScanning(true);
    setResults([]);
    try {
      const { db } = await getDb();
      const cards = await getUntaggedCardsByBundle(db, parseInt(bundleId));
      setUntaggedCards(cards);
      setSelectedCardIds(new Set(cards.map((c) => c.id)));
      if (cards.length === 0) {
        toast.success("All cards in this bundle already have tags!");
      } else {
        toast.info(`Found ${cards.length} untagged card(s)`);
      }
    } catch (e) {
      toast.error("Failed to scan cards");
      console.error(e);
    } finally {
      setScanning(false);
    }
  }, [bundleId]);

  // ── Run tagger ──
  const handleRun = useCallback(async () => {
    if (!providerId || untaggedCards.length === 0) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    setRunning(true);
    setResults([]);

    try {
      const provider = providers.find((p) => p.id.toString() === providerId);
      if (!provider) throw new Error("Provider not found");

      const { db } = await getDb();
      const currentTags = await getAllTags(db);

      const tagResults = await tagCardsWithAI({
        provider,
        cards: untaggedCards,
        existingTags: currentTags,
        batchSize,
        onProgress: setProgress,
        abortSignal: abortController.signal,
      });

      setResults(tagResults);
      if (tagResults.length > 0) {
        toast.success(`Tagged ${tagResults.length} cards`);
      } else {
        toast.warning("No tags were generated. Try adjusting the batch size or provider.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.info("Tagging cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Tagging failed");
      }
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [providerId, providers, untaggedCards, batchSize]);

  // ── Cancel tagger ──
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  // ── Toggle card selection for applying ──
  const toggleCardSelection = useCallback((cardId: number) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  // ── Apply tags to DB ──
  const handleApply = useCallback(async () => {
    if (results.length === 0) return;
    setApplying(true);
    try {
      const { db } = await getDb();
      const selectedResults = results.filter((r) => selectedCardIds.has(r.cardId));
      let reusedCount = 0;
      let newCount = 0;
      const existingTagNames = new Set(allTags.map((t) => t.name.toLowerCase()));

      for (const result of selectedResults) {
        const tagIds: number[] = [];
        for (const tagName of result.tags) {
          const tag = await getOrCreateTag(db, tagName);
          if (tag) {
            tagIds.push(tag.id);
            if (existingTagNames.has(tagName.toLowerCase())) {
              reusedCount++;
            } else {
              newCount++;
              existingTagNames.add(tagName.toLowerCase());
            }
          }
        }
        await addTagsToCard(db, result.cardId, tagIds);
      }

      toast.success(
        `Applied tags to ${selectedResults.length} card(s) (${reusedCount} reused, ${newCount} new)`,
      );
      setResults([]);
      setUntaggedCards([]);
      await loadRef.current?.(); // refresh data
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply tags");
    } finally {
      setApplying(false);
    }
  }, [results, selectedCardIds, allTags]);

  // ── Discard results ──
  const handleDiscard = useCallback(() => {
    setResults([]);
  }, []);

  // ── Determine all unique new tag names from results ──
  const allNewTagNames = results.flatMap((r) => r.tags);
  const uniqueNewTagNames = [...new Set(allNewTagNames)];
  const existingTagNamesLower = new Set(allTags.map((t) => t.name.toLowerCase()));
  const existingInResults = uniqueNewTagNames.filter((t) => existingTagNamesLower.has(t.toLowerCase()));
  const newTagNames = uniqueNewTagNames.filter((t) => !existingTagNamesLower.has(t.toLowerCase()));

  // ── Tag-centric grouping ──
  const tagGrouped = new Map<string, number[]>();
  for (const r of results) {
    for (const tag of r.tags) {
      const existing = tagGrouped.get(tag) ?? [];
      existing.push(r.cardId);
      tagGrouped.set(tag, existing);
    }
  }

  // ── Selected bundle info ──
  const selectedBundle = bundles.find((b) => b.id.toString() === bundleId);

  // ── Loading state ──
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
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <RiPriceTag3Line className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Auto-Tag Cards</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Use AI to automatically assign tags to untagged cards in a bundle
        </p>
      </div>

      {/* No providers */}
      {providers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">
              No AI providers configured. Add a provider first in the Factory Overview.
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
          {/* ── Configuration Panel ── */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Select a bundle to tag and configure the AI provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {/* Bundle selector */}
                <div className="space-y-2">
                  <Label>Bundle</Label>
                  <Select value={bundleId} onValueChange={setBundleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bundle" />
                    </SelectTrigger>
                    <SelectContent>
                      {bundles.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Provider selector */}
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

                {/* Batch size */}
                <div className="space-y-2">
                  <Label>Cards per batch: {batchSize}</Label>
                  <Slider
                    value={[batchSize]}
                    onValueChange={([v]) => setBatchSize(v)}
                    min={5}
                    max={30}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Smaller batches = fewer tokens per request but more API calls
                  </p>
                </div>
              </div>

              {/* Scan button */}
              <div className="mt-4">
                <Button
                  onClick={handleScan}
                  disabled={!bundleId || scanning || running}
                >
                  <RiSearchLine className="mr-2 h-4 w-4" />
                  {scanning ? "Scanning..." : "Scan for Untagged Cards"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Preview Section ── */}
          {bundleId && !scanning && untaggedCards.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <RiPriceTag3Line className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {selectedBundle
                    ? `All cards in "${selectedBundle.title}" are already tagged!`
                    : "Select a bundle and scan for untagged cards"}
                </p>
                {!results.length && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleScan}
                    disabled={!bundleId}
                  >
                    Scan Again
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {untaggedCards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Untagged Cards ({untaggedCards.length})
                  {selectedBundle && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      in &ldquo;{selectedBundle?.title}&rdquo;
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {allTags.length > 0 && (
                    <span>
                      Existing tags:{" "}
                      {allTags.map((t) => t.name).join(", ")}
                    </span>
                  )}
                  {allTags.length === 0 && (
                    <span>No existing tags yet. New tags will be created.</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-64">
                  <div className="space-y-1">
                    {untaggedCards.map((card) => (
                      <div
                        key={card.id}
                        className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                      >
                        <Badge variant="secondary">{card.type.replace("_", " ")}</Badge>
                        <span className="flex-1 truncate text-sm">
                          {card.front}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* ── Run Section ── */}
          {untaggedCards.length > 0 && !running && results.length === 0 && (
            <Button onClick={handleRun} disabled={!providerId} size="lg">
              <RiPlayCircleLine className="mr-2 h-4 w-4" />
              Start Tagging ({untaggedCards.length} cards)
            </Button>
          )}

          {/* ── Progress ── */}
          {running && (
            <Card>
              <CardContent className="py-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="font-medium">
                        {progress?.message ?? "Starting..."}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                    >
                      <RiStopCircleLine className="mr-1 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                  {progress && (
                    <div className="space-y-1">
                      <Progress
                        value={(progress.current / progress.total) * 100}
                      />
                      <p className="text-xs text-muted-foreground">
                        Batch {progress.current} of {progress.total}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Results Section ── */}
          {results.length > 0 && !running && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>
                        Results ({results.length} cards tagged)
                      </CardTitle>
                      <CardDescription>
                        {existingInResults.length} tags reused,{" "}
                        {newTagNames.length} tags newly created
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewMode(viewMode === "card" ? "tag" : "card")}
                      >
                        {viewMode === "card" ? "By Tag" : "By Card"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Tag cloud */}
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {uniqueNewTagNames.map((tag) => {
                      const isExisting = existingTagNamesLower.has(tag.toLowerCase());
                      return (
                        <Badge
                          key={tag}
                          variant={isExisting ? "secondary" : "outline"}
                        >
                          {tag}
                          {isExisting ? " (existing)" : " (new)"}
                        </Badge>
                      );
                    })}
                  </div>

                  <Separator className="mb-4" />

                  {/* Card-centric view */}
                  {viewMode === "card" && (
                    <ScrollArea className="max-h-96">
                      <div className="space-y-2">
                        {results.map((result) => {
                          const card = untaggedCards.find(
                            (c) => c.id === result.cardId,
                          );
                          return (
                            <Card
                              key={result.cardId}
                              className={`transition-colors ${
                                selectedCardIds.has(result.cardId)
                                  ? "border-primary bg-primary/5"
                                  : ""
                              }`}
                            >
                              <CardContent className="flex items-start gap-3 py-3">
                                <Checkbox
                                  checked={selectedCardIds.has(result.cardId)}
                                  onCheckedChange={() =>
                                    toggleCardSelection(result.cardId)
                                  }
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge variant="secondary">
                                      {card?.type?.replace("_", " ") ?? "card"}
                                    </Badge>
                                    <span className="truncate text-sm font-medium">
                                      {card?.front ?? "Unknown card"}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {result.tags.map((tag) => {
                                      const isExisting = existingTagNamesLower.has(
                                        tag.toLowerCase(),
                                      );
                                      return (
                                        <Badge
                                          key={tag}
                                          variant={
                                            isExisting ? "secondary" : "outline"
                                          }
                                          className="text-xs"
                                        >
                                          {tag}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}

                  {/* Tag-centric view */}
                  {viewMode === "tag" && (
                    <ScrollArea className="max-h-96">
                      <div className="space-y-3">
                        {[...tagGrouped.entries()]
                          .sort((a, b) => b[1].length - a[1].length)
                          .map(([tag, cardIds]) => {
                            const isExisting = existingTagNamesLower.has(
                              tag.toLowerCase(),
                            );
                            return (
                              <div key={tag}>
                                <div className="mb-1 flex items-center gap-2">
                                  <Badge
                                    variant={
                                      isExisting ? "secondary" : "outline"
                                    }
                                  >
                                    {tag}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {cardIds.length} card(s)
                                  </span>
                                </div>
                                <div className="ml-1 space-y-0.5">
                                  {cardIds.map((cardId) => {
                                    const card = untaggedCards.find(
                                      (c) => c.id === cardId,
                                    );
                                    return (
                                      <p
                                        key={cardId}
                                        className="truncate text-xs text-muted-foreground pl-3 border-l-2 border-muted"
                                      >
                                        {card?.front ?? "Unknown card"}
                                      </p>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleApply}
                  disabled={applying || selectedCardIds.size === 0}
                  size="lg"
                >
                  <RiCheckboxMultipleLine className="mr-2 h-4 w-4" />
                  {applying
                    ? "Applying..."
                    : `Apply Tags (${selectedCardIds.size} card${selectedCardIds.size === 1 ? "" : "s"})`}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDiscard}
                  disabled={applying}
                  size="lg"
                >
                  <RiCloseLine className="mr-2 h-4 w-4" />
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Boxed>
  );
}
