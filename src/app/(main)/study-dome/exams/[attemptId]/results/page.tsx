"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { RiCheckLine, RiCloseLine, RiArrowLeftLine, RiRefreshLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getDb } from "@/db";
import { getExamResults } from "@/lib/db-queries";

export default function ExamResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);

  const [results, setResults] = useState<Awaited<ReturnType<typeof getExamResults>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();
      const r = await getExamResults(db, parseInt(attemptId));
      setResults(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);

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

  if (!results) {
    return (
      <Boxed className="py-8">
        <p>Results not found.</p>
        <Button asChild variant="link">
          <Link href="/study-dome">Back to Study Dome</Link>
        </Button>
      </Boxed>
    );
  }

  const { attempt, exam, answers } = results;
  const scorePct = attempt.score != null ? Math.round(attempt.score * 100) : 0;
  const totalQuestions = answers.length;

  const pointsPerCorrect = exam?.pointsPerCorrect ?? 1;
  const pointsPerWrong = exam?.pointsPerWrong ?? 0;

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const wrongCount = answers.filter((a) => a.isCorrect === false).length;
  const ungradedCount = answers.filter((a) => a.isCorrect === null).length;

  const totalEarned = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
  const maxPossible = answers.length * pointsPerCorrect;

  const timeTaken = attempt.completedAt && attempt.startedAt
    ? Math.round((attempt.completedAt - attempt.startedAt) / 1000)
    : 0;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  return (
    <Boxed className="py-8">
      <div className="mb-6">
        <Button asChild variant="link" className="px-0">
          <Link href="/study-dome">
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to Study Dome
          </Link>
        </Button>
      </div>

      <Card className="mb-8">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            {scorePct >= 70 ? (
              <RiCheckLine className="h-10 w-10 text-green-500" />
            ) : (
              <RiCloseLine className="h-10 w-10 text-red-500" />
            )}
          </div>
          <CardTitle className="text-3xl">{exam?.title ?? "Exam Results"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mx-auto max-w-sm space-y-4">
            <div className="text-center">
              <span className="text-5xl font-bold">{scorePct}%</span>
              {(pointsPerCorrect !== 1 || pointsPerWrong !== 0) && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalEarned.toFixed(pointsPerWrong % 1 ? 2 : 1)} / {maxPossible.toFixed(1)} points
                </p>
              )}
            </div>
            <Progress value={scorePct} className="h-3" />
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold">{correctCount}</p>
                <p className="text-sm text-muted-foreground">Correct</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold">{wrongCount}</p>
                <p className="text-sm text-muted-foreground">Incorrect</p>
              </div>
            </div>
            {(pointsPerCorrect !== 1 || pointsPerWrong !== 0) && (
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold">+{(correctCount * pointsPerCorrect).toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">Points earned</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold">{(pointsPerWrong * wrongCount).toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">Penalty</p>
                </div>
              </div>
            )}
            <div className="text-center text-sm text-muted-foreground">
              Time: {formatTime(timeTaken)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FSRS update summary */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Spaced Repetition Impact
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RiCheckLine className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm">
                <strong>{correctCount}</strong> card{correctCount !== 1 ? "s" : ""} reinforced (correct answer{correctCount !== 1 ? "s" : ""})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <RiRefreshLine className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-sm">
                <strong>{wrongCount}</strong> card{wrongCount !== 1 ? "s" : ""} marked for re-review (incorrect answer{wrongCount !== 1 ? "s" : ""})
              </span>
            </div>
            {ungradedCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {ungradedCount} open answer{ungradedCount !== 1 ? "s" : ""} not auto-graded — FSRS not updated
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-question breakdown */}
      <h2 className="mb-4 text-xl font-semibold">Question Breakdown</h2>
      <div className="space-y-3">
        {answers.map((a, i) => {
          const isCorrect = a.isCorrect;
          const card = a.card;
          const parsedOptions = card?.options ? (JSON.parse(card.options) as string[]) : null;
          const parsedCorrect = card?.correctIndices ? (JSON.parse(card.correctIndices) as number[]) : null;

          return (
            <Card key={a.id} className={isCorrect ? "border-green-200" : "border-red-200"}>
              <CardContent className="py-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg font-bold">{i + 1}.</span>
                  {isCorrect ? (
                    <Badge className="bg-green-600">Correct</Badge>
                  ) : isCorrect === false ? (
                    <Badge variant="destructive">Incorrect</Badge>
                  ) : (
                    <Badge variant="secondary">Not Auto-graded</Badge>
                  )}
                  {card && (
                    <Badge variant="outline">
                      {card.type.replace("_", " ")}
                    </Badge>
                  )}
                </div>

                {card && (
                  <>
                    <p className="mb-2 font-medium">{card.front}</p>
                    {(pointsPerCorrect !== 1 || pointsPerWrong !== 0) && (
                      <span className="text-xs text-muted-foreground">
                        {a.isCorrect ? `+${pointsPerCorrect}` : a.isCorrect === false ? `${pointsPerWrong}` : '—'}
                      </span>
                    )}

                    {/* Multi-choice options */}
                    {parsedOptions && (
                      <div className="mb-2 space-y-1">
                        {parsedOptions.map((opt, j) => {
                          const isCorrectOpt = parsedCorrect?.includes(j) ?? false;
                          const userSelected = card.type === "multi_radio"
                            ? a.answer === j.toString()
                            : a.answer ? (JSON.parse(a.answer) as number[]).includes(j) : false;
                          return (
                            <div
                              key={j}
                              className={`rounded-md border p-2 text-sm ${
                                isCorrectOpt
                                  ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                  : userSelected
                                    ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                    : ""
                              }`}
                            >
                              {opt}
                              {isCorrectOpt && <Badge className="ml-2 bg-green-600 text-xs">Correct</Badge>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Open answer */}
                    {card.type === "open" && (
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Your answer:</span> {a.answer || "(blank)"}</p>
                        <p><span className="text-muted-foreground">Correct answer:</span> {card.back}</p>
                      </div>
                    )}

                    {card.type === "knowledge" && (
                      <p className="text-sm text-muted-foreground">{card.back}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/study-dome">Back to Study Dome</Link>
        </Button>
        {results.exam?.bundleId && (
          <Button asChild>
            <Link href={`/study-dome/bundles/${results.exam.bundleId}`}>Back to Bundle</Link>
          </Button>
        )}
        {wrongCount > 0 && results.exam?.bundleId && (
          <Button asChild>
            <Link href={`/study-dome/review?bundleId=${results.exam.bundleId}`}>
              <RiRefreshLine className="mr-2 h-4 w-4" />
              Review Weak Cards
            </Link>
          </Button>
        )}
      </div>
    </Boxed>
  );
}
