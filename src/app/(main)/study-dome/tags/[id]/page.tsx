"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { RiArrowLeftLine, RiBookOpenLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { getCardsByTag, getCardTags } from "@/lib/services";

export default function TagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tagId = parseInt(id);

  const [cards, setCards] = useState<Awaited<ReturnType<typeof getCardsByTag>>>([]);
  const [tagName, setTagName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [c] = await Promise.all([
          getCardsByTag(db, tagId),
        ]);
        setCards(c);
        if (c.length > 0) {
          const tags = await getCardTags(db, c[0].cards.id);
          const tag = tags.find((t) => t.id === tagId);
          if (tag) setTagName(tag.name);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tagId]);

  return (
    <Boxed className="py-8">
      <div className="mb-4">
        <Button asChild variant="link" className="px-0">
          <Link href="/study-dome/tags">
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to Tags
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tagName || `Tag #${tagId}`}</h1>
          <p className="mt-1 text-muted-foreground">
            {cards.length} card{cards.length !== 1 ? "s" : ""} with this tag
          </p>
        </div>
        <Button asChild>
          <Link href={`/study-dome/review?tagId=${tagId}`}>
            <RiBookOpenLine className="mr-2 h-4 w-4" />
            Review These Cards
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No cards with this tag.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((row) => (
            <Link key={row.cards.id} href={`/study-dome/cards/${row.cards.id}`}>
              <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-sm">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{row.cards.type.replace("_", " ")}</Badge>
                    <p className="font-medium line-clamp-1">{row.cards.front}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Boxed>
  );
}
