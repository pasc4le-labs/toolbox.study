"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { RiCheckLine, RiCloseLine, RiArrowLeftLine } from "@remixicon/react";
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
  const correctCount = answers.filter((a) => a.isCorrect).length;
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
            </div>
            <Progress value={scorePct} className="h-3" />
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold">{correctCount}</p>
                <p className="text-sm text-muted-foreground">Correct</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold">{totalQuestions - correctCount}</p>
                <p className="text-sm text-muted-foreground">Incorrect</p>
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Time: {formatTime(timeTaken)}
            </div>
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
      </div>
    </Boxed>
  );
}
