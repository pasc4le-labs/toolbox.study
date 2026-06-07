"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RiDownloadLine,
} from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { RenderLatex } from "@/components/render-latex";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getDb } from "@/db";
import {
  getAllCards,
  getAllBundles,
  getCardsByBundle,
} from "@/lib/services";
import { toast } from "sonner";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

function parseJson<T>(val: string | null): T | null {
  if (!val) return null;
  try { return JSON.parse(val) as T; } catch { return null; }
}

interface CardWithTags {
  id: number;
  type: string;
  front: string;
  back: string;
  explanation: string | null;
  options: string[] | null;
  correctIndices: number[] | null;
  tagNames: string[];
}

interface BundleWithCards {
  id: number;
  title: string;
  description: string | null;
  cards: CardWithTags[];
}

type ExportScope = "bundles" | "cards";

export default function ExportPage() {
  const [scope, setScope] = useState<ExportScope>("bundles");
  const [allCards, setAllCards] = useState<Awaited<ReturnType<typeof getAllCards>>>([]);
  const [allBundles, setAllBundles] = useState<Awaited<ReturnType<typeof getAllBundles>>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Selected bundles (for bundle export)
  const [selectedBundles, setSelectedBundles] = useState<Set<number>>(new Set());
  // Selected cards (for card export)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [c, b] = await Promise.all([
          getAllCards(db),
          getAllBundles(db),
        ]);
        setAllCards(c);
        setAllBundles(b);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggleBundle = (id: number) => {
    setSelectedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCard = (id: number) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllBundles = () => {
    if (selectedBundles.size === allBundles.length) {
      setSelectedBundles(new Set());
    } else {
      setSelectedBundles(new Set(allBundles.map((b) => b.id)));
    }
  };

  const toggleAllCards = () => {
    if (selectedCards.size === allCards.length) {
      setSelectedCards(new Set());
    } else {
      setSelectedCards(new Set(allCards.map((c) => c.id)));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { db } = await getDb();

      if (scope === "bundles") {
        if (selectedBundles.size === 0) {
          toast.error("Select at least one bundle to export");
          return;
        }

        const exportData: { bundles: BundleWithCards[] } = { bundles: [] };

        for (const bundleId of selectedBundles) {
          const bundle = allBundles.find((b) => b.id === bundleId);
          if (!bundle) continue;

          const bundleCardRows = await db
            .select()
            .from(schema.bundleCards)
            .where(eq(schema.bundleCards.bundleId, bundleId))
            .orderBy(schema.bundleCards.order);

          const cards: CardWithTags[] = [];
          for (const bc of bundleCardRows) {
            const cardData = allCards.find((c) => c.id === bc.cardId);
            if (!cardData) continue;

            const tags = await db
              .select({ name: schema.tags.name })
              .from(schema.cardTags)
              .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
              .where(eq(schema.cardTags.cardId, cardData.id));

            cards.push({
              id: cardData.id,
              type: cardData.type,
              front: cardData.front,
              back: cardData.back,
              explanation: cardData.explanation,
              options: parseJson<string[]>(cardData.options),
              correctIndices: parseJson<number[]>(cardData.correctIndices),
              tagNames: tags.map((t) => t.name),
            });
          }

          exportData.bundles.push({
            id: bundle.id,
            title: bundle.title,
            description: bundle.description,
            cards,
          });
        }

        const json = JSON.stringify(exportData, null, 2);
        downloadJson(json, "studytoolbox-bundles");
        toast.success(`Exported ${exportData.bundles.length} bundle(s)`);
      } else {
        // Card export
        if (selectedCards.size === 0) {
          toast.error("Select at least one card to export");
          return;
        }

        const cards: CardWithTags[] = [];

        for (const cardId of selectedCards) {
          const cardData = allCards.find((c) => c.id === cardId);
          if (!cardData) continue;

          const tags = await db
            .select({ name: schema.tags.name })
            .from(schema.cardTags)
            .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
            .where(eq(schema.cardTags.cardId, cardData.id));

          cards.push({
            id: cardData.id,
            type: cardData.type,
            front: cardData.front,
            back: cardData.back,
            explanation: cardData.explanation,
            options: parseJson<string[]>(cardData.options),
            correctIndices: parseJson<number[]>(cardData.correctIndices),
            tagNames: tags.map((t) => t.name),
          });
        }

        const exportData = { cards };
        const json = JSON.stringify(exportData, null, 2);
        downloadJson(json, "studytoolbox-cards");
        toast.success(`Exported ${cards.length} card(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const downloadJson = (content: string, baseName: string) => {
    const filename = `${baseName}-${Date.now()}.json`;
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        <PageTitle>Export</PageTitle>
        <h1 className="text-3xl font-bold tracking-tight">Export</h1>
        <p className="mt-1 text-muted-foreground">
          Export your cards and bundles as JSON files
        </p>
      </div>

      {/* Scope selector */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={scope === "bundles" ? "default" : "outline"}
          onClick={() => { setScope("bundles"); setSelectedBundles(new Set()); setSelectedCards(new Set()); }}
        >
          Bundles
        </Button>
        <Button
          variant={scope === "cards" ? "default" : "outline"}
          onClick={() => { setScope("cards"); setSelectedBundles(new Set()); setSelectedCards(new Set()); }}
        >
          Individual Cards
        </Button>
      </div>

      {scope === "bundles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Select Bundles ({selectedBundles.size} of {allBundles.length})
            </Label>
            <Button variant="ghost" size="sm" onClick={toggleAllBundles}>
              {selectedBundles.size === allBundles.length ? "Deselect All" : "Select All"}
            </Button>
          </div>

          {allBundles.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No bundles yet. Create bundles in the Study Dome to export them here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {allBundles.map((bundle) => (
                <Card
                  key={bundle.id}
                  className={`cursor-pointer transition-colors ${
                    selectedBundles.has(bundle.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleBundle(bundle.id)}
                >
                  <CardContent className="flex items-center gap-3 py-3">
                    <Checkbox
                      checked={selectedBundles.has(bundle.id)}
                      onCheckedChange={() => toggleBundle(bundle.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{bundle.title}</p>
                      {bundle.description && (
                        <p className="truncate text-sm text-muted-foreground">
                          {bundle.description}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Button onClick={handleExport} disabled={exporting || selectedBundles.size === 0} size="lg">
            <RiDownloadLine className="mr-2 h-4 w-4" />
            {exporting
              ? "Exporting..."
              : `Export ${selectedBundles.size} Bundle(s)`}
          </Button>
        </div>
      )}

      {scope === "cards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Select Cards ({selectedCards.size} of {allCards.length})
            </Label>
            <Button variant="ghost" size="sm" onClick={toggleAllCards}>
              {selectedCards.size === allCards.length ? "Deselect All" : "Select All"}
            </Button>
          </div>

          {allCards.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No cards yet. Create cards in the Study Dome to export them here.
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {allCards.map((card) => (
                <Card
                  key={card.id}
                  className={`cursor-pointer transition-colors ${
                    selectedCards.has(card.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleCard(card.id)}
                >
                  <CardContent className="flex items-center gap-3 py-2">
                    <Checkbox
                      checked={selectedCards.has(card.id)}
                      onCheckedChange={() => toggleCard(card.id)}
                    />
                    <Badge variant="secondary">{card.type.replace("_", " ")}</Badge>
                    <span className="flex-1 truncate text-sm"><RenderLatex content={card.front} /></span>
                    <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:inline">
                      <RenderLatex content={card.back} />
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Button onClick={handleExport} disabled={exporting || selectedCards.size === 0} size="lg">
            <RiDownloadLine className="mr-2 h-4 w-4" />
            {exporting
              ? "Exporting..."
              : `Export ${selectedCards.size} Card(s)`}
          </Button>
        </div>
      )}
    </Boxed>
  );
}