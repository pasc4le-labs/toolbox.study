"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import Link from "next/link";
import {
  RiArrowLeftLine,
  RiBarChartLine,
  RiHistoryLine,
  RiTrophyLine,
  RiTimeLine,
  RiErrorWarningLine,
  RiPlayLine,
} from "@remixicon/react";
import {
  VisXYContainer,
  VisLine,
  VisStackedBar,
  VisAxis,
  VisSingleContainer,
  VisDonut,
} from "@unovis/react";
import { CurveType } from "@unovis/ts";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getDb } from "@/db";
import {
  getBundleById,
  getBundleExamStats,
  getBundleCardWeakness,
} from "@/lib/services";

// ── Helpers ──

function scoreColorClass(score: number) {
  if (score >= 0.7) return "text-green-600";
  if (score >= 0.4) return "text-orange-500";
  return "text-red-500";
}

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ── Types ──

type AttemptPoint = { index: number; date: string; score: number; status: "completed" | "unfinished" };
type WeaknessPoint = { cardFront: string; correct: number; incorrect: number };
type DonutDatum = { key: string; value: number };

// ── Component ──

export default function BundleStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const bundleId = parseInt(id);

  const [bundle, setBundle] = useState<Awaited<
    ReturnType<typeof getBundleById>
  > | null>(null);
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getBundleExamStats>
  > | null>(null);
  const [weakness, setWeakness] = useState<Awaited<
    ReturnType<typeof getBundleCardWeakness>
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [b, s, w] = await Promise.all([
          getBundleById(db, bundleId),
          getBundleExamStats(db, bundleId),
          getBundleCardWeakness(db, bundleId),
        ]);
        setBundle(b);
        setStats(s);
        setWeakness(w);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bundleId]);

  // ── Memoized chart data ──

  const attemptPoints = useMemo<AttemptPoint[]>(() => {
    if (!stats) return [];
    return stats.attempts.map((a, i) => ({
      index: i + 1,
      date: new Date(a.attempt.startedAt).toLocaleDateString(),
      score:
        a.attempt.completedAt != null
          ? Math.round((a.attempt.score ?? 0) * 100)
          : 0,
      status: a.attempt.completedAt != null ? "completed" : "unfinished",
    }));
  }, [stats]);

  const donutData = useMemo<DonutDatum[]>(() => {
    if (!weakness) return [];
    const totalCorrect = weakness.reduce((s, w) => s + w.correct, 0);
    const totalIncorrect = weakness.reduce((s, w) => s + w.incorrect, 0);
    if (totalCorrect + totalIncorrect === 0) return [];
    return [
      { key: "Correct", value: totalCorrect },
      { key: "Incorrect", value: totalIncorrect },
    ];
  }, [weakness]);

  const weaknessData = useMemo<WeaknessPoint[]>(() => {
    if (!weakness) return [];
    return weakness.slice(0, 10).map((w) => ({
      cardFront: truncate(w.card.front, 20),
      correct: w.correct,
      incorrect: w.incorrect,
    }));
  }, [weakness]);

  const totalCorrect = useMemo(
    () => weakness?.reduce((s, w) => s + w.correct, 0) ?? 0,
    [weakness],
  );
  const totalIncorrect = useMemo(
    () => weakness?.reduce((s, w) => s + w.incorrect, 0) ?? 0,
    [weakness],
  );

  // ── Memoized chart callbacks (always declared, never conditionally) ──

  const lineXAccessor = useCallback((d: AttemptPoint) => d.index, []);
  const lineYAccessor = useCallback((d: AttemptPoint) => d.score, []);

  const barXAccessor = useCallback(
    (d: WeaknessPoint, i: number) => i,
    [],
  );
  const barYCorrect = useCallback((d: WeaknessPoint) => d.correct, []);
  const barYIncorrect = useCallback((d: WeaknessPoint) => d.incorrect, []);

  const donutValueAccessor = useCallback(
    (d: DonutDatum) => d.value,
    [],
  );

  const xTickFormat = useCallback(
    (tick: number | Date) =>
      weaknessData[tick as number]?.cardFront ?? "",
    [weaknessData],
  );

  // ── Loading state ──

  if (loading) {
    return (
      <Boxed className="py-8">
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-muted"
            />
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

  // ── Empty state (no exams / no attempts) ──

  const hasData =
    stats && (stats.totalAttempts > 0 || donutData.length > 0 || weaknessData.length > 0);

  if (!hasData) {
    return (
      <Boxed className="py-8">
        <div className="mb-4">
          <Button asChild variant="link" className="px-0">
            <Link href={`/study-dome/bundles/${bundleId}`}>
              <RiArrowLeftLine className="mr-1 h-4 w-4" />
              Back to {bundle.title}
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            {bundle.title} — Statistics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats?.exams.length ?? 0} exam
            {(stats?.exams.length ?? 0) !== 1 ? "s" : ""} ·{" "}
            {stats?.totalAttempts ?? 0} attempt
            {(stats?.totalAttempts ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>

        <Tabs defaultValue="statistics">
          <TabsList>
            <TabsTrigger value="statistics">
              <RiBarChartLine className="mr-1 h-3.5 w-3.5" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="past-exams" asChild>
              <Link href={`/study-dome/bundles/${bundleId}/past-exams`}>
                <RiHistoryLine className="mr-1 h-3.5 w-3.5" />
                Past Exams
              </Link>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="statistics">
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <RiBarChartLine className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">No exam data yet</p>
                <p className="mb-6 text-sm text-muted-foreground">
                  Take an exam to see statistics.
                </p>
                <Button asChild>
                  <Link href={`/study-dome/bundles/${bundleId}`}>
                    <RiPlayLine className="mr-2 h-4 w-4" />
                    Go to Bundle
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Boxed>
    );
  }

  const avgPct = Math.round((stats?.avgScore ?? 0) * 100);
  const bestPct = Math.round((stats?.bestScore ?? 0) * 100);
  const worstPct = Math.round((stats?.worstScore ?? 0) * 100);

  return (
    <Boxed className="py-8">
      {/* Header */}
      <div className="mb-4">
        <Button asChild variant="link" className="px-0">
          <Link href={`/study-dome/bundles/${bundleId}`}>
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to {bundle.title}
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {bundle.title} — Statistics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats?.exams.length ?? 0} exam
          {(stats?.exams.length ?? 0) !== 1 ? "s" : ""} ·{" "}
          {stats?.totalAttempts ?? 0} attempt
          {(stats?.totalAttempts ?? 0) !== 1 ? "s" : ""}
        </p>
      </div>

      <Tabs defaultValue="statistics">
        <TabsList>
          <TabsTrigger value="statistics">
            <RiBarChartLine className="mr-1 h-3.5 w-3.5" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="past-exams" asChild>
            <Link href={`/study-dome/bundles/${bundleId}/past-exams`}>
              <RiHistoryLine className="mr-1 h-3.5 w-3.5" />
              Past Exams
            </Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="statistics">
          {/* Summary cards */}
          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Attempts
                </CardTitle>
                <RiHistoryLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.totalAttempts ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.completedAttempts ?? 0} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Average Score
                </CardTitle>
                <RiBarChartLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${scoreColorClass(stats?.avgScore ?? 0)}`}>
                  {avgPct}%
                </div>
                <Progress value={avgPct} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Best Score</CardTitle>
                <RiTrophyLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${scoreColorClass(stats?.bestScore ?? 0)}`}>
                  {bestPct}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Worst: {worstPct}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Time</CardTitle>
                <RiTimeLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(stats?.totalTimeSeconds ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Across all completed attempts
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts grid */}
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* Score Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RiHistoryLine className="h-5 w-5" />
                  Score Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attemptPoints.length <= 1 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    Take more exams to see a trend.
                  </p>
                ) : (
                  <VisXYContainer
                    data={attemptPoints}
                    height={300}
                    yDomain={[0, 100]}
                  >
                    <VisLine<AttemptPoint>
                      x={lineXAccessor}
                      y={lineYAccessor}
                      lineWidth={2}
                      curveType={CurveType.Basis}
                    />
                    <VisAxis
                      type="x"
                      label="Attempt"
                      tickValues={attemptPoints.map((d) => d.index)}
                    />
                    <VisAxis type="y" label="Score %" />
                  </VisXYContainer>
                )}
              </CardContent>
            </Card>

            {/* Overall Correctness Donut */}
            {donutData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RiBarChartLine className="h-5 w-5" />
                    Overall Correctness
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <VisSingleContainer data={donutData} height={250}>
                    <VisDonut<DonutDatum>
                      value={donutValueAccessor}
                      centralLabel={`${totalCorrect + totalIncorrect} Answers`}
                      color={["#22c55e", "#ef4444"]}
                    />
                  </VisSingleContainer>
                  <div className="mt-2 flex justify-center gap-6 text-sm">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
                      Correct: {totalCorrect}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                      Incorrect: {totalIncorrect}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Weak Cards Chart */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RiErrorWarningLine className="h-5 w-5" />
                Weak Cards
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weaknessData.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  All cards are performing well — no weak spots detected.
                </p>
              ) : (
                <VisXYContainer data={weaknessData} height={300}>
                  <VisStackedBar<WeaknessPoint>
                    x={barXAccessor}
                    y={[barYCorrect, barYIncorrect]}
                    color={["#22c55e", "#ef4444"]}
                    roundedCorners={4}
                  />
                  <VisAxis
                    type="x"
                    label="Card"
                    tickFormat={xTickFormat}
                  />
                  <VisAxis type="y" label="Answers" />
                </VisXYContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Boxed>
  );
}
