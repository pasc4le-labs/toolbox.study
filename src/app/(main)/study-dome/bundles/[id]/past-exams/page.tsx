"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import Link from "next/link";
import {
  RiArrowLeftLine,
  RiHistoryLine,
  RiBarChartLine,
} from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDb } from "@/db";
import { getBundleById, getBundlePastAttempts } from "@/lib/services";

function scoreColorClass(score: number) {
  if (score >= 0.7) return "text-green-600";
  if (score >= 0.4) return "text-orange-500";
  return "text-red-500";
}

function formatDuration(startedAt: number, completedAt: number | null) {
  if (!completedAt) return "Unfinished";
  const seconds = Math.round((completedAt - startedAt) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

type AttemptItem = {
  attempt: { id: number; examId: number; startedAt: number; completedAt: number | null; score: number | null };
  exam: { id: number; title: string; bundleId: number | null; questionCount: number; timeLimitSeconds: number | null; difficultyFilter: number | null; pointsPerCorrect: number; pointsPerWrong: number; createdAt: number };
};

export default function PastExamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bundleId = parseInt(id);

  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getBundleById>> | null>(null);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const [b, a] = await Promise.all([
          getBundleById(db, bundleId),
          getBundlePastAttempts(db, bundleId),
        ]);
        setBundle(b);
        setAttempts(a);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bundleId]);

  const completedCount = useMemo(
    () => attempts.filter((a) => a.attempt.completedAt != null).length,
    [attempts],
  );
  const unfinishedCount = useMemo(
    () => attempts.filter((a) => a.attempt.completedAt == null).length,
    [attempts],
  );

  const filteredAttempts = useMemo(() => {
    if (statusFilter === "completed") return attempts.filter((a) => a.attempt.completedAt != null);
    if (statusFilter === "unfinished") return attempts.filter((a) => a.attempt.completedAt == null);
    return attempts;
  }, [attempts, statusFilter]);

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
          <Link href={`/study-dome/bundles/${bundleId}`}>
            <RiArrowLeftLine className="mr-1 h-4 w-4" />
            Back to {bundle.title}
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {bundle.title} — Past Exams
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {attempts.length} attempt{attempts.length !== 1 ? "s" : ""}
        </p>
      </div>

      <Tabs defaultValue="past-exams">
        <TabsList>
          <TabsTrigger value="statistics" asChild>
            <Link href={`/study-dome/bundles/${bundleId}/stats`}>
              <RiBarChartLine className="mr-1 h-3.5 w-3.5" />
              Statistics
            </Link>
          </TabsTrigger>
          <TabsTrigger value="past-exams">
            <RiHistoryLine className="mr-1 h-3.5 w-3.5" />
            Past Exams
          </TabsTrigger>
        </TabsList>
        <TabsContent value="past-exams">
          {attempts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <RiHistoryLine className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">No exams taken yet</p>
                <p className="mb-6 text-sm text-muted-foreground">
                  Take an exam from the bundle page to see your history here.
                </p>
                <Button asChild>
                  <Link href={`/study-dome/bundles/${bundleId}`}>
                    Go to Bundle
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {completedCount} completed · {unfinishedCount} unfinished
                </p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="unfinished">Unfinished</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Exam Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttempts.map((item, idx) => {
                      const isCompleted = item.attempt.completedAt != null;
                      const score = isCompleted ? (item.attempt.score ?? 0) : null;
                      const scorePct = score !== null ? Math.round(score * 100) : null;

                      return (
                        <TableRow key={item.attempt.id} className="cursor-pointer">
                          <TableCell>
                            <Link
                              href={`/study-dome/exams/${item.attempt.id}/results`}
                              className="block"
                            >
                              {idx + 1}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/study-dome/exams/${item.attempt.id}/results`}
                              className="block font-medium hover:underline"
                            >
                              {item.exam.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/study-dome/exams/${item.attempt.id}/results`}
                              className="block"
                            >
                              {new Date(item.attempt.startedAt).toLocaleDateString()}
                            </Link>
                          </TableCell>
                          <TableCell>
                          <Link
                            href={`/study-dome/exams/${item.attempt.id}/results`}
                            className={`block font-semibold ${score !== null ? scoreColorClass(score) : "text-muted-foreground"}`}
                          >
                              {scorePct !== null ? `${scorePct}%` : "—"}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/study-dome/exams/${item.attempt.id}/results`}
                              className="block"
                            >
                              {formatDuration(item.attempt.startedAt, item.attempt.completedAt)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/study-dome/exams/${item.attempt.id}/results`}
                              className="block"
                            >
                              {isCompleted ? (
                                <Badge className="bg-green-600">Completed</Badge>
                              ) : (
                                <Badge variant="secondary">Unfinished</Badge>
                              )}
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Boxed>
  );
}
