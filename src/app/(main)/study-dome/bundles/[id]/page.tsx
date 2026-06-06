"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftLine,
  RiAddLine,
  RiDeleteBinLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiPlayLine,
  RiBarChartLine,
  RiHistoryLine,
} from "@remixicon/react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getDb } from "@/db";
import {
  getBundleById,
  getCardsByBundle,
  removeCardFromBundle,
  reorderBundleCard,
  addCardsToBundle,
  getAllCards,
  createExam,
  startExamAttempt,
  updateBundle,
} from "@/lib/db-queries";
import { toast } from "sonner";

export default function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bundleId = parseInt(id);
  const router = useRouter();

  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getBundleById>> | null>(null);
  const [cards, setCards] = useState<Awaited<ReturnType<typeof getCardsByBundle>>>([]);
  const [loading, setLoading] = useState(true);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [allCards, setAllCards] = useState<Awaited<ReturnType<typeof getAllCards>>>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0);
  const [difficultyFilter, setDifficultyFilter] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pointsPerCorrect, setPointsPerCorrect] = useState(1);
  const [pointsPerWrong, setPointsPerWrong] = useState(0);
  const [creatingExam, setCreatingExam] = useState(false);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();
      const [b, c] = await Promise.all([
        getBundleById(db, bundleId),
        getCardsByBundle(db, bundleId),
      ]);
      setBundle(b);
      setCards(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => { load(); }, [load]);

  const handleRemoveCard = async (cardId: number) => {
    try {
      const { db } = await getDb();
      await removeCardFromBundle(db, bundleId, cardId);
      toast.success("Card removed");
      await load();
    } catch {
      toast.error("Failed to remove card");
    }
  };

  const handleReorder = async (cardId: number, direction: "up" | "down") => {
    const idx = cards.findIndex((c) => c.bundle_cards.cardId === cardId);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= cards.length) return;

    try {
      const { db } = await getDb();
      await reorderBundleCard(db, bundleId, cardId, newIdx);
      await reorderBundleCard(db, bundleId, cards[newIdx].bundle_cards.cardId, idx);
      await load();
    } catch {
      toast.error("Failed to reorder");
    }
  };

  const handleAddCards = async () => {
    if (selectedCardIds.length === 0) {
      toast.error("Select at least one card");
      return;
    }
    try {
      const { db } = await getDb();
      await addCardsToBundle(db, bundleId, selectedCardIds);
      toast.success("Cards added");
      setAddCardDialogOpen(false);
      setSelectedCardIds([]);
      await load();
    } catch {
      toast.error("Failed to add cards");
    }
  };

  const openAddDialog = async () => {
    try {
      const { db } = await getDb();
      const all = await getAllCards(db);
      setAllCards(all);
      setSelectedCardIds([]);
      setAddCardDialogOpen(true);
    } catch {
      toast.error("Failed to load cards");
    }
  };

  const handleStartExam = async () => {
    if (!bundle) return;
    setCreatingExam(true);
    try {
      const { db } = await getDb();

      // Save exam settings to bundle for next time
      await updateBundle(db, bundleId, {
        examQuestionCount: questionCount,
        examTimeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : null,
        examDifficultyFilter: difficultyFilter / 100,
        examPointsPerCorrect: pointsPerCorrect,
        examPointsPerWrong: pointsPerWrong,
      });

      const exam = await createExam(db, {
        title: examTitle || `${bundle.title} Exam`,
        bundleId,
        questionCount,
        timeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : null,
        difficultyFilter: difficultyFilter / 100,
        pointsPerCorrect,
        pointsPerWrong,
      });
      if (!exam) throw new Error("Failed to create exam");
      const { attempt } = await startExamAttempt(db, exam.id);
      setExamDialogOpen(false);
      router.push(`/study-dome/exams/${attempt.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start exam");
    } finally {
      setCreatingExam(false);
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

  if (!bundle) {
    return (
      <Boxed className="py-8">
        <p>Bundle not found.</p>
        <Button asChild variant="link">
          <Link href="/study-dome/bundles">Back to Bundles</Link>
        </Button>
      </Boxed>
    );
  }

  return (
    <Boxed className="py-8">
      <div className="mb-4">
        <Button asChild variant="link" className="px-0">
          <Link href="/study-dome/bundles">
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to Bundles
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{bundle.title}</h1>
          {bundle.description && (
            <p className="mt-1 text-muted-foreground">{bundle.description}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} card{cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={examDialogOpen} onOpenChange={(open) => {
            setExamDialogOpen(open);
            if (open && bundle) {
              setExamTitle(bundle.title + " Exam");
              setQuestionCount(bundle.examQuestionCount ?? Math.min(5, cards.length));
              setTimeLimitMinutes(bundle.examTimeLimitSeconds ? bundle.examTimeLimitSeconds / 60 : 0);
              setDifficultyFilter(Math.round((bundle.examDifficultyFilter ?? 0) * 100));
              setPointsPerCorrect(bundle.examPointsPerCorrect ?? 1);
              setPointsPerWrong(bundle.examPointsPerWrong ?? 0);
              setAdvancedOpen(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button disabled={cards.length === 0}>
                <RiPlayLine className="mr-2 h-4 w-4" />
                Take Exam
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure Exam</DialogTitle>
                <DialogDescription>
                  Set up your exam from &ldquo;{bundle.title}&rdquo;
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Exam Title</Label>
                  <Input
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder={`${bundle.title} Exam`}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Questions</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[questionCount]}
                      onValueChange={([v]) => setQuestionCount(v)}
                      min={1}
                      max={Math.max(1, cards.length)}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={Math.max(1, cards.length)}
                      value={Number.isNaN(questionCount) ? 1 : questionCount}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value);
                        setQuestionCount(isNaN(raw) ? 1 : Math.min(Math.max(1, raw), cards.length));
                      }}
                      className="w-16 text-center"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{cards.length} cards available</p>
                </div>
                <div className="space-y-2">
                  <Label>Time Limit (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[timeLimitMinutes]}
                      onValueChange={([v]) => setTimeLimitMinutes(v)}
                      min={0}
                      max={120}
                      step={5}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      value={Number.isNaN(timeLimitMinutes) ? 0 : timeLimitMinutes}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value);
                        setTimeLimitMinutes(isNaN(raw) ? 0 : Math.max(0, raw));
                      }}
                      className="w-16 text-center"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{timeLimitMinutes === 0 ? "No time limit" : `${timeLimitMinutes} minute${timeLimitMinutes !== 1 ? "s" : ""}`}</p>
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <span>Advanced Options</span>
                      {advancedOpen ? <RiArrowUpSLine className="h-4 w-4" /> : <RiArrowDownSLine className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Points per correct answer</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={Number.isNaN(pointsPerCorrect) ? 1 : pointsPerCorrect}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          setPointsPerCorrect(isNaN(raw) ? 1 : Math.max(0, raw));
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Default: 1 point</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Negative points per wrong answer</Label>
                      <Input
                        type="number"
                        max={0}
                        step={0.25}
                        value={Number.isNaN(pointsPerWrong) ? 0 : pointsPerWrong}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          setPointsPerWrong(isNaN(raw) ? 0 : Math.min(0, raw));
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Penalty for incorrect answers. Use 0 for no penalty, negative values (e.g. -0.25) to penalize.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Focus on weak cards: {difficultyFilter}%</Label>
                      <Slider
                        value={[difficultyFilter]}
                        onValueChange={([v]) => setDifficultyFilter(v)}
                        min={0}
                        max={100}
                        step={10}
                      />
                      <p className="text-xs text-muted-foreground">0% = random, 100% = only weakest cards</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExamDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleStartExam} disabled={creatingExam}>
                  {creatingExam ? "Starting..." : "Start Exam"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={openAddDialog}>
            <RiAddLine className="mr-2 h-4 w-4" />
            Add Cards
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/study-dome/bundles/${bundleId}/stats`}>
              <RiBarChartLine className="mr-2 h-4 w-4" />
              Statistics
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/study-dome/bundles/${bundleId}/past-exams`}>
              <RiHistoryLine className="mr-2 h-4 w-4" />
              Past Exams
            </Link>
          </Button>
        </div>
      </div>

      {/* Card list in bundle */}
      {cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">No cards in this bundle yet.</p>
            <Button onClick={openAddDialog}>
              <RiAddLine className="mr-2 h-4 w-4" />
              Add Cards
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cards.map((row, idx) => (
            <Card key={row.cards.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="w-6 text-center text-sm text-muted-foreground">{idx + 1}.</span>
                <div className="flex-1">
                  <Link
                    href={`/study-dome/cards/${row.cards.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.cards.front}
                  </Link>
                  <Badge variant="secondary" className="ml-2">
                    {row.cards.type.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={idx === 0}
                    onClick={() => handleReorder(row.bundle_cards.cardId, "up")}
                  >
                    <RiArrowUpLine className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={idx === cards.length - 1}
                    onClick={() => handleReorder(row.bundle_cards.cardId, "down")}
                  >
                    <RiArrowDownLine className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveCard(row.bundle_cards.cardId)}
                  >
                    <RiDeleteBinLine className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Cards Dialog */}
      <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Cards to Bundle</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {allCards
              .filter((c) => !cards.some((row) => row.cards.id === c.id))
              .map((card) => (
                <div
                  key={card.id}
                  className={`cursor-pointer rounded-md border p-3 transition-colors ${
                    selectedCardIds.includes(card.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() =>
                    setSelectedCardIds((prev) =>
                      prev.includes(card.id)
                        ? prev.filter((id) => id !== card.id)
                        : [...prev, card.id],
                    )
                  }
                >
                  <p className="font-medium">{card.front}</p>
                  <Badge variant="secondary" className="mt-1">
                    {card.type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            {allCards.filter((c) => !cards.some((row) => row.cards.id === c.id)).length === 0 && (
              <p className="py-8 text-center text-muted-foreground">All cards are already in this bundle.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCardDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCards} disabled={selectedCardIds.length === 0}>
              Add {selectedCardIds.length} card{selectedCardIds.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Boxed>
  );
}
