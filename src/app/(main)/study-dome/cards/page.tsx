"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { RiAddLine, RiSearchLine, RiDeleteBinLine, RiEditLine } from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { RenderLatex } from "@/components/render-latex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getDb } from "@/db";
import { getAllCards, searchCards, deleteCard, getCardTags } from "@/lib/services";
import { toast } from "sonner";

export default function CardsPage() {
  const [cards, setCards] = useState<Awaited<ReturnType<typeof getAllCards>>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [cardTags, setCardTags] = useState<Record<number, Array<{ id: number; name: string }>>>({});

  const loadRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const allCards = searchQuery.trim()
          ? await searchCards(db, searchQuery.trim())
          : await getAllCards(db);
        setCards(allCards);

        // Load tags for each card
        const tagsMap: Record<number, Array<{ id: number; name: string }>> = {};
        await Promise.all(
          allCards.map(async (c) => {
            const tags = await getCardTags(db, c.id);
            tagsMap[c.id] = tags;
          }),
        );
        setCardTags(tagsMap);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadRef.current = load;
    load();
  }, [searchQuery]);

  const handleDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      const { db } = await getDb();
      await deleteCard(db, deleteConfirmId);
      toast.success("Card deleted");
      setDeleteConfirmId(null);
      await loadRef.current?.();
    } catch {
      toast.error("Failed to delete card");
    }
  };

  return (
    <Boxed className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <PageTitle>Cards</PageTitle>
        <h1 className="text-3xl font-bold tracking-tight">Cards</h1>
        <Button asChild>
          <Link href="/study-dome/cards/new">
            <RiAddLine className="mr-2 h-4 w-4" />
            New Card
          </Link>
        </Button>
      </div>

      <div className="relative mb-6">
        <RiSearchLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">
              {searchQuery.trim() ? "No cards match your search." : "No cards yet. Create your first card!"}
            </p>
            {!searchQuery.trim() && (
              <Button asChild>
                <Link href="/study-dome/cards/new">
                  <RiAddLine className="mr-2 h-4 w-4" />
                  Create Card
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <Link key={card.id} href={`/study-dome/cards/${card.id}`} className="block">
              <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-sm">
                <CardContent className="flex items-start justify-between py-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary">{card.type.replace("_", " ")}</Badge>
                    </div>
                    <div className="font-medium line-clamp-1"><RenderLatex content={card.front} /></div>
                    <div className="mt-1 text-sm text-muted-foreground line-clamp-1"><RenderLatex content={card.back} /></div>
                    {cardTags[card.id] && cardTags[card.id].length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {cardTags[card.id].map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-xs">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Card</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this card? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Boxed>
  );
}
