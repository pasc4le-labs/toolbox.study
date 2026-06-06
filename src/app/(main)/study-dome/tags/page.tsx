"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RiBookOpenLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/db";
import { getTagStats } from "@/lib/services";

export default function TagsPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getTagStats>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const s = await getTagStats(db);
        setStats(s);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Boxed className="py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Tags</h1>
        <p className="mt-1 text-muted-foreground">
          Per-tag FSRS statistics
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No tags yet. Add tags to your cards to see stats here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => {
            const total = stat.stateNew + stat.stateLearning + stat.stateReview + stat.stateRelearning;
            const pctReview = total > 0 ? Math.round((stat.stateReview / total) * 100) : 0;
            return (
              <Link key={stat.tagId} href={`/study-dome/tags/${stat.tagId}`}>
                <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span>{stat.tagName}</span>
                      <Badge variant="secondary">{stat.cardCount}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Stability</span>
                        <span>{stat.avgStability ? stat.avgStability.toFixed(1) : "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Review %</span>
                        <span>{pctReview}%</span>
                      </div>
                    </div>
                    <Progress value={pctReview} className="h-2" />
                    <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                      <span>{stat.stateNew} new</span>
                      <span>{stat.stateLearning} learning</span>
                      <span>{stat.stateReview} review</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Boxed>
  );
}
