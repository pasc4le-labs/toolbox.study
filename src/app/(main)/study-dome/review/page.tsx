"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiBrainLine,
} from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { RenderLatex } from "@/components/render-latex";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db";
import { getDueCards, rateCard } from "@/lib/services";
import { Rating } from "ts-fsrs";
import { toast } from "sonner";

type ReviewCardData = {
  card: Awaited<ReturnType<typeof getDueCards>>[number]["cards"];
  fsrs: Awaited<ReturnType<typeof getDueCards>>[number]["card_fsrs"];
};

function ReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tagId = searchParams.get("tagId");
  const bundleId = searchParams.get("bundleId");

  const [cards, setCards] = useState<ReviewCardData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<Array<{ front: string; rating: number }>>([]);

  // For interactive card types
  const [selectedRadio, setSelectedRadio] = useState<number | null>(null);
  const [selectedCheckboxes, setSelectedCheckboxes] = useState<number[]>([]);
  const [openAnswer, setOpenAnswer] = useState("");

  useEffect(() => {
    async function loadCards() {
      try {
        const { db } = await getDb();
        const due = await getDueCards(db, {
          tagId: tagId ? parseInt(tagId) : undefined,
          bundleId: bundleId ? parseInt(bundleId) : undefined,
        });
        setCards(
          due.map((d) => ({
            card: d.cards,
            fsrs: d.card_fsrs,
          })),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadCards();
  }, [tagId, bundleId]);

  const current = cards[currentIdx];
  const isMulti = current?.card.type === "multi_radio" || current?.card.type === "multi_select";
  const isOpen = current?.card.type === "open";
  const parsedOptions = current?.card.options ? (JSON.parse(current.card.options) as string[]) : null;
  const parsedCorrect = current?.card.correctIndices ? (JSON.parse(current.card.correctIndices) as number[]) : null;

  const handleRate = async (rating: Rating) => {
    if (!current) return;
    try {
      const { db } = await getDb();
      await rateCard(db, current.card.id, rating);
      setResults((prev) => [...prev, { front: current.card.front, rating }]);
    } catch {
      toast.error("Failed to record rating");
    }
  };

  const handleReveal = () => {
    setShowAnswer(true);
  };

  const handleNext = async (rating: Rating) => {
    if (!current) return;
    await handleRate(rating);
    setShowAnswer(false);
    setSelectedRadio(null);
    setSelectedCheckboxes([]);
    setOpenAnswer("");

    if (currentIdx + 1 >= cards.length) {
      setCompleted(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  if (loading) {
    return (
      <Boxed className="py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </Boxed>
    );
  }

  if (cards.length === 0) {
    return (
      <Boxed className="py-8">
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <RiBrainLine className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <PageTitle>Review</PageTitle>
        <h2 className="mb-2 text-2xl font-bold">No Cards Due!</h2>
            <p className="mb-6 text-muted-foreground">
              All caught up! Come back later for more review.
            </p>
            <Button asChild>
              <Link href="/study-dome">Back to Study Dome</Link>
            </Button>
          </CardContent>
        </Card>
      </Boxed>
    );
  }

  if (completed) {
    const avgRating = results.reduce((s, r) => s + r.rating, 0) / results.length;
    return (
      <Boxed className="py-8">
        <Card>
          <CardHeader className="text-center">
            <RiCheckLine className="mx-auto mb-2 h-12 w-12 text-green-500" />
            <CardTitle className="text-2xl">Review Complete!</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto mb-6 max-w-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cards Reviewed</span>
                <span className="font-medium">{results.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Average Rating</span>
                <span className="font-medium">
                  {["", "Again", "Hard", "Good", "Easy"][Math.round(avgRating)] ?? "N/A"}
                </span>
              </div>
            </div>
            <div className="mb-6 space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span className="line-clamp-1 flex-1"><RenderLatex content={r.front} /></span>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    {["", "Again", "Hard", "Good", "Easy"][r.rating]}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/study-dome">Back to Study Dome</Link>
              </Button>
              <Button onClick={() => { setCompleted(false); setCurrentIdx(0); setResults([]); }}>
                Review Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </Boxed>
    );
  }

  return (
    <Boxed className="py-8">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Card {currentIdx + 1} of {cards.length}
          </span>
          <span className="text-muted-foreground">
            {Math.round(((currentIdx) / cards.length) * 100)}%
          </span>
        </div>
        <Progress value={(currentIdx / cards.length) * 100} />
      </div>

      {/* Card display */}
      <Card className="mb-6">
        <CardContent className="py-8">
          <div className="mb-4">
            <Badge variant="secondary">
              {current.card.type.replace("_", " ")}
            </Badge>
          </div>

          {/* Front */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Question</h3>
            <div className="whitespace-pre-wrap text-lg"><RenderLatex content={current.card.front} /></div>
          </div>

          {/* Interactive options for multi-choice questions */}
          {isMulti && parsedOptions && !showAnswer && (
            <div className="mb-6 space-y-3">
              {current.card.type === "multi_radio" ? (
                <RadioGroup
                  value={selectedRadio?.toString() ?? ""}
                  onValueChange={(v) => setSelectedRadio(parseInt(v))}
                >
                  {parsedOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border p-3">
                      <RadioGroupItem value={i.toString()} id={`opt-${i}`} />
                      <Label htmlFor={`opt-${i}`} className="flex-1 cursor-pointer">
                        <RenderLatex content={opt} />
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-3">
                  {parsedOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border p-3">
                      <Checkbox
                        id={`opt-${i}`}
                        checked={selectedCheckboxes.includes(i)}
                        onCheckedChange={() =>
                          setSelectedCheckboxes((prev) =>
                            prev.includes(i)
                              ? prev.filter((v) => v !== i)
                              : [...prev, i],
                          )
                        }
                      />
                      <Label htmlFor={`opt-${i}`} className="flex-1 cursor-pointer">
                        <RenderLatex content={opt} />
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Open answer */}
          {isOpen && !showAnswer && (
            <div className="mb-6">
              <Textarea
                placeholder="Type your answer..."
                value={openAnswer}
                onChange={(e) => setOpenAnswer(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {/* Back / Answer */}
          {showAnswer ? (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Answer</h3>
                <div className="whitespace-pre-wrap text-lg"><RenderLatex content={current.card.back} /></div>
              </div>

              {/* Show correctness for multi-choice */}
              {isMulti && parsedOptions && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Your Selection vs Correct</h3>
                  {parsedOptions.map((opt, i) => {
                    const isCorrect = parsedCorrect?.includes(i) ?? false;
                    const userSelected = current.card.type === "multi_radio"
                      ? selectedRadio === i
                      : selectedCheckboxes.includes(i);
                    const isUserCorrect = (userSelected && isCorrect) || (!userSelected && !isCorrect);
                    return (
                      <div
                        key={i}
                        className={`rounded-md border p-2 ${
                          isCorrect
                            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                            : userSelected
                              ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                              : ""
                        }`}
                      >
                        <span className="mr-2">{isCorrect ? "✓" : userSelected ? "✗" : ""}</span>
                        <RenderLatex content={opt} />
                        {isCorrect && (
                          <Badge className="ml-2 bg-green-600 text-xs">Correct</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {current.card.explanation && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Explanation</h3>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    <RenderLatex content={current.card.explanation} />
                  </p>
                </div>
              )}

              {/* Rating buttons */}
              <div className="pt-4">
                <h3 className="mb-3 text-sm font-medium">How well did you know this?</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button
                    variant="outline"
                    className="flex-col gap-1 py-4"
                    onClick={() => handleNext(Rating.Again)}
                  >
                    <RiCloseLine className="h-5 w-5 text-red-500" />
                    <span className="text-xs">Again</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-col gap-1 py-4"
                    onClick={() => handleNext(Rating.Hard)}
                  >
                    <RiTimeLine className="h-5 w-5 text-orange-500" />
                    <span className="text-xs">Hard</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-col gap-1 py-4"
                    onClick={() => handleNext(Rating.Good)}
                  >
                    <RiCheckLine className="h-5 w-5 text-green-500" />
                    <span className="text-xs">Good</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-col gap-1 py-4"
                    onClick={() => handleNext(Rating.Easy)}
                  >
                    <RiBrainLine className="h-5 w-5 text-blue-500" />
                    <span className="text-xs">Easy</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center pt-4">
              <Button size="lg" onClick={handleReveal}>
                Show Answer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Boxed>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <Boxed className="py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </Boxed>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}
