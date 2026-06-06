"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiEditLine, RiDeleteBinLine, RiArrowLeftLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDb } from "@/db";
import {
  getCardById,
  deleteCard,
  getCardTags,
  getCardBundles,
} from "@/lib/services";
import { toast } from "sonner";

export default function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cardId = parseInt(id);
  const router = useRouter();

  const [card, setCard] = useState<Awaited<ReturnType<typeof getCardById>> | null>(null);
  const [tags, setTags] = useState<Awaited<ReturnType<typeof getCardTags>>>([]);
  const [bundles, setBundles] = useState<Awaited<ReturnType<typeof getCardBundles>>>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();
      const [c, t, b] = await Promise.all([
        getCardById(db, cardId),
        getCardTags(db, cardId),
        getCardBundles(db, cardId),
      ]);
      setCard(c);
      setTags(t);
      setBundles(b);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    try {
      const { db } = await getDb();
      await deleteCard(db, cardId);
      toast.success("Card deleted");
      router.push("/study-dome/cards");
    } catch {
      toast.error("Failed to delete card");
    }
  };

  if (loading) {
    return (
      <Boxed className="py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </Boxed>
    );
  }

  if (!card) {
    return (
      <Boxed className="py-8">
        <p>Card not found.</p>
        <Button asChild variant="link">
          <Link href="/study-dome/cards">Back to Cards</Link>
        </Button>
      </Boxed>
    );
  }

  const parsedOptions = card.options ? JSON.parse(card.options) as string[] : null;
  const parsedCorrectIndices = card.correctIndices ? JSON.parse(card.correctIndices) as number[] : null;

  return (
    <Boxed className="py-8">
      <div className="mb-6">
        <Button asChild variant="link" className="px-0">
          <Link href="/study-dome/cards">
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to Cards
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge>{card.type.replace("_", " ")}</Badge>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/study-dome/cards/${card.id}/edit`}>
              <RiEditLine className="mr-1 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <RiDeleteBinLine className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Front</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{card.front}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Back</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{card.back}</p>
          </CardContent>
        </Card>
      </div>

      {card.explanation && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Explanation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-muted-foreground">{card.explanation}</p>
          </CardContent>
        </Card>
      )}

      {parsedOptions && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {parsedOptions.map((opt, i) => {
                const isCorrect = parsedCorrectIndices?.includes(i);
                return (
                  <li
                    key={i}
                    className={`rounded-md border p-3 ${
                      isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""
                    }`}
                  >
                    <span className="mr-2 font-mono text-sm text-muted-foreground">{i + 1}.</span>
                    {opt}
                    {isCorrect && (
                      <Badge variant="default" className="ml-2 bg-green-600">
                        Correct
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {tags.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {bundles.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Bundles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {bundles.map((bundle) => (
                <Button key={bundle.id} variant="outline" size="sm" asChild>
                  <Link href={`/study-dome/bundles/${bundle.id}`}>{bundle.title}</Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Card</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this card? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Boxed>
  );
}
