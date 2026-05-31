"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { eq, and } from "drizzle-orm";
import {
  RiTimerLine,
  RiCheckLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiFlagLine,
} from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import {
  getExamById,
  submitExamAnswer,
  completeExamAttempt,
} from "@/lib/db-queries";
import { toast } from "sonner";

interface QuestionData {
  cardId: number;
  front: string;
  back: string;
  explanation: string | null;
  type: string;
  options: string | null;
  correctIndices: string | null;
  order: number;
}

export default function ExamAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [exam, setExam] = useState<Awaited<ReturnType<typeof getExamById>> | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [answers, setAnswers] = useState<Record<number, { answer: string | null; isCorrect: boolean | null }>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const currentOrderRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();

      // Get attempt
      const [attemptRow] = await db
        .select()
        .from(schema.examAttempts)
        .where(eq(schema.examAttempts.id, parseInt(attemptId)))
        .limit(1);

      if (!attemptRow || attemptRow.completedAt) {
        toast.error("Exam not found or already completed");
        router.push("/study-dome");
        return;
      }

      const e = await getExamById(db, attemptRow.examId);
      setExam(e);

      if (!e || !e.bundleId) {
        toast.error("Exam has no bundle");
        return;
      }

      // Get bundle cards as questions
      const bundleCards = await db
        .select()
        .from(schema.bundleCards)
        .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
        .where(eq(schema.bundleCards.bundleId, e.bundleId))
        .orderBy(schema.bundleCards.order);

      // Filter out knowledge cards and limit to questionCount
      const qs: QuestionData[] = bundleCards
        .filter((r) => r.cards.type !== "knowledge")
        .slice(0, e.questionCount)
        .map((r) => ({
          cardId: r.cards.id,
          front: r.cards.front,
          back: r.cards.back,
          explanation: r.cards.explanation,
          type: r.cards.type,
          options: r.cards.options,
          correctIndices: r.cards.correctIndices,
          order: r.bundle_cards.order,
        }));

      setQuestions(qs);

      // Load existing answers for this attempt
      const existingAnswers = await db
        .select()
        .from(schema.examAnswers)
        .where(eq(schema.examAnswers.attemptId, parseInt(attemptId)));

      const ansMap: Record<number, { answer: string | null; isCorrect: boolean | null }> = {};
      for (const a of existingAnswers) {
        ansMap[a.cardId] = { answer: a.answer, isCorrect: a.isCorrect };
      }
      setAnswers(ansMap);

      // Set timer
      if (e.timeLimitSeconds) {
        const elapsed = Date.now() - attemptRow.startedAt;
        const remaining = Math.max(0, e.timeLimitSeconds * 1000 - elapsed);
        setTimeLeft(Math.ceil(remaining / 1000));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load exam");
    } finally {
      setLoading(false);
    }
  }, [attemptId, router]);

  useEffect(() => { load(); }, [load]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const current = questions[currentIdx];
  currentOrderRef.current = current?.order ?? 0;
  const isMulti = current?.type === "multi_radio" || current?.type === "multi_select";
  const isOpen = current?.type === "open";
  const parsedOptions = current?.options ? (JSON.parse(current.options) as string[]) : null;
  const parsedCorrect = current?.correctIndices ? (JSON.parse(current.correctIndices) as number[]) : null;

  const currentAnswer = current ? answers[current.cardId] : undefined;
  const selectedRadio = currentAnswer?.answer ? parseInt(currentAnswer.answer) : null;
  const selectedCheckboxes = currentAnswer?.answer ? (JSON.parse(currentAnswer.answer) as number[]) : [];

  const saveAnswer = async (cardId: number, answer: string | null, isCorrect: boolean | null) => {
    setAnswers((prev) => ({ ...prev, [cardId]: { answer, isCorrect } }));
    try {
      const { db } = await getDb();
      // Delete existing answer first
      await db
        .delete(schema.examAnswers)
        .where(
          and(
            eq(schema.examAnswers.attemptId, parseInt(attemptId)),
            eq(schema.examAnswers.cardId, cardId),
          ),
        );
      await db.insert(schema.examAnswers).values({
        attemptId: parseInt(attemptId),
        cardId,
        order: currentOrderRef.current,
        answer,
        isCorrect,
      });
    } catch {
      // silently fail - answer saved locally
    }
  };

  const handleRadioAnswer = (value: string) => {
    if (!current) return;
    const idx = parseInt(value);
    const isCorrect = parsedCorrect?.includes(idx) ?? false;
    saveAnswer(current.cardId, value, isCorrect);
  };

  const handleCheckboxAnswer = (optIdx: number) => {
    if (!current) return;
    const newSelected = selectedCheckboxes.includes(optIdx)
      ? selectedCheckboxes.filter((i) => i !== optIdx)
      : [...selectedCheckboxes, optIdx];
    const answer = JSON.stringify(newSelected);
    const isCorrect =
      newSelected.length === parsedCorrect?.length &&
      newSelected.every((i) => parsedCorrect?.includes(i));
    saveAnswer(current.cardId, answer, isCorrect);
    currentOrderRef.current = current?.order ?? 0;
  };

  const toggleFlag = (cardId: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleOpenAnswer = (value: string) => {
    if (!current) return;
    saveAnswer(current.cardId, value || null, null);
  };

  const handleSubmit = async (isAutoSubmit = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { db } = await getDb();
      const score = await completeExamAttempt(db, parseInt(attemptId));
      toast.success(isAutoSubmit ? "Time's up! Exam auto-submitted." : "Exam submitted!");
      router.push(`/study-dome/exams/${attemptId}/results`);
    } catch {
      toast.error("Failed to submit exam");
    } finally {
      setSubmitting(false);
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

  if (!exam || questions.length === 0) {
    return (
      <Boxed className="py-8">
        <p>Exam not found or no questions available.</p>
        <Button onClick={() => router.push("/study-dome")}>Back to Study Dome</Button>
      </Boxed>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Main content */}
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Question {currentIdx + 1} of {questions.length}</span>
              <Progress value={((currentIdx + 1) / questions.length) * 100} className="h-2 w-32" />
            </div>
          </div>

          {current && (
            <div className="flex gap-3">
              <Card className="flex-1">
                <CardContent className="py-4">
                  <div className="mb-4">
                    <Badge variant="secondary">
                      {current.type.replaceAll("_", " ")}
                    </Badge>
                  </div>

                  <p className="mb-6 whitespace-pre-wrap text-lg">{current.front}</p>

                  {current.type === "multi_radio" && parsedOptions && (
                    <RadioGroup
                      value={selectedRadio?.toString() ?? ""}
                      onValueChange={handleRadioAnswer}
                    >
                      {parsedOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border p-3">
                          <RadioGroupItem value={i.toString()} id={`q-opt-${i}`} />
                          <Label htmlFor={`q-opt-${i}`} className="flex-1 cursor-pointer">
                            {opt}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {current.type === "multi_select" && parsedOptions && (
                    <div className="space-y-3">
                      {parsedOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border p-3">
                          <Checkbox
                            id={`q-opt-${i}`}
                            checked={selectedCheckboxes.includes(i)}
                            onCheckedChange={() => handleCheckboxAnswer(i)}
                          />
                          <Label htmlFor={`q-opt-${i}`} className="flex-1 cursor-pointer">
                            {opt}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}

                  {current.type === "open" && (
                    <Textarea
                      placeholder="Type your answer..."
                      value={currentAnswer?.answer ?? ""}
                      onChange={(e) => handleOpenAnswer(e.target.value)}
                      rows={6}
                    />
                  )}

                  {current.type === "knowledge" && (
                    <p className="text-muted-foreground">
                      Self-review card. Think about your answer, then check.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Button
                variant="outline"
                size="icon"
                aria-label={flagged.has(current.cardId) ? "Unflag question" : "Flag question"}
                onClick={() => toggleFlag(current.cardId)}
                className={`shrink-0 ${flagged.has(current.cardId) ? "border-red-500 bg-red-500 text-white hover:bg-red-600" : ""}`}
              >
                <RiFlagLine className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => i - 1)}
            >
              <RiArrowLeftLine className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={currentIdx >= questions.length - 1}
              onClick={() => setCurrentIdx((i) => i + 1)}
            >
              Next
              <RiArrowRightLine className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-72 border-l bg-muted/30 p-4 md:block">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">{exam.title}</h3>
            {timeLeft !== null && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${timeLeft < 60 ? "text-red-500" : "text-muted-foreground"}`}>
                <RiTimerLine className="h-4 w-4" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
          </div>

          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const hasAnswer = answers[q.cardId]?.answer != null;
                const isCurrent = i === currentIdx;
                return (
                  <Button
                    key={q.cardId}
                    variant={isCurrent ? "default" : hasAnswer ? "secondary" : "outline"}
                    size="sm"
                    className={`h-9 w-9 ${flagged.has(q.cardId) ? "bg-red-500 text-white hover:bg-red-600" : ""}`}
                    onClick={() => setCurrentIdx(i)}
                  >
                    {i + 1}
                  </Button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Answered</span>
              <span>{answeredCount} / {questions.length}</span>
            </div>
            <Button
              className="w-full"
              onClick={() => handleSubmit()}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit Exam"}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar via Sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="fixed bottom-4 right-4 md:hidden">
            <RiTimerLine className="mr-2 h-4 w-4" />
            {timeLeft !== null ? formatTime(timeLeft) : "Questions"}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-72">
          <div className="space-y-4">
            <h3 className="font-semibold">{exam.title}</h3>
            {timeLeft !== null && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RiTimerLine className="h-4 w-4" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const hasAnswer = answers[q.cardId]?.answer != null;
                const isCurrent = i === currentIdx;
                return (
                  <Button
                    key={q.cardId}
                    variant={isCurrent ? "default" : hasAnswer ? "secondary" : "outline"}
                    size="sm"
                    className={`h-9 w-9 ${flagged.has(q.cardId) ? "bg-red-500 text-white hover:bg-red-600" : ""}`}
                    onClick={() => setCurrentIdx(i)}
                  >
                    {i + 1}
                  </Button>
                );
              })}
            </div>
            <Button className="w-full" onClick={() => handleSubmit()} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Exam"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
