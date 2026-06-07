"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RiAddLine, RiBookOpenLine, RiBarChartLine } from "@remixicon/react";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BundleCard } from "@/components/bundle-card";
import { getDb } from "@/db";
import { getAllBundles } from "@/lib/services";

export default function StudyDomePage() {
  const [bundles, setBundles] = useState<Awaited<ReturnType<typeof getAllBundles>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const b = await getAllBundles(db);
        setBundles(b);
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
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <PageTitle>Study Dome</PageTitle>
      <h1 className="text-3xl font-bold tracking-tight">Study Dome</h1>
          <p className="mt-1 text-muted-foreground">
            Review flashcards, take exams, track your progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/study-dome/review">
              <RiBookOpenLine className="mr-2 h-4 w-4" />
              Review Due Cards
            </Link>
          </Button>
          <Button asChild>
            <Link href="/study-dome/cards/new">
              <RiAddLine className="mr-2 h-4 w-4" />
              New Card
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <RiBookOpenLine className="h-5 w-5 text-primary" />
              Quick Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Review cards due for spaced repetition.
            </CardDescription>
            <Button asChild variant="link" className="px-0">
              <Link href="/study-dome/review">Start Review &rarr;</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <RiAddLine className="h-5 w-5 text-primary" />
              Create Bundle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Group cards into bundles for organized study.
            </CardDescription>
            <Button asChild variant="link" className="px-0">
              <Link href="/study-dome/bundles/new">New Bundle &rarr;</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <RiBarChartLine className="h-5 w-5 text-primary" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              View tag-based FSRS statistics.
            </CardDescription>
            <Button asChild variant="link" className="px-0">
              <Link href="/study-dome/tags">View Tags &rarr;</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-4 text-xl font-semibold">Your Bundles</h2>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">
              No bundles yet. Create your first bundle to get started!
            </p>
            <Button asChild>
              <Link href="/study-dome/bundles/new">
                <RiAddLine className="mr-2 h-4 w-4" />
                Create Bundle
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {bundles.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} />
          ))}
        </div>
      )}
    </Boxed>
  );
}
