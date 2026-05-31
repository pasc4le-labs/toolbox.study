# 07 — Bundle Exam Statistics Page Plan

> Add a dedicated per-bundle statistics page that shows historical exam performance, attempt history, and card-level weakness analysis so students can track their progress over time.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.
- Use `pnpm dlx` or `pnpm exec` instead of `npx` everywhere.

---

## Research Summary

### Verified Architecture

| Area | Details |
|------|---------|
| **Next.js version** | `16.2.6` — App Router, `params` is a `Promise` in pages; client components access it via React `use(params)` (verified from `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and existing pages). |
| **DB** | sql.js (client-side SQLite) via Drizzle ORM `0.45.2`. All data access is synchronous SQLite in the browser; async wrappers are for consistency. |
| **Schema** | `exams.bundleId` → `bundles.id`; `examAttempts.examId` → `exams.id`; `examAnswers.attemptId` → `examAttempts.id`; `examAnswers.isCorrect` stores `1`/`0`/`NULL` with Drizzle `{ mode: 'boolean' }`. |
| **Existing queries** | `getBundleById`, `getCardsByBundle`, `getExamResults`, `completeExamAttempt` in `src/lib/db-queries.ts` demonstrate the join patterns (exams → attempts → answers). |
| **UI patterns** | All pages are `"use client"`, load data in `useEffect` via `getDb()`, show skeletons with `animate-pulse`, use `Boxed`, `Card`, `Button`, `Badge`, `Progress` from `@/components/ui/*`. |
| **Icons** | `@remixicon/react` — existing imports include `RiBarChartLine`, `RiArrowLeftLine`, `RiHistoryLine`, `RiTrophyLine`, `RiTimeLine`, `RiErrorWarningLine`. |
| **Routing** | Nested routes under `src/app/(main)/study-dome/bundles/[id]/` already exist (`page.tsx`, `edit/page.tsx`). Adding `stats/page.tsx` follows the exact same convention. |

### Key API Signatures (verified from codebase)

```ts
// src/lib/db-queries.ts — existing pattern for joins
export async function getExamResults(db: Db, attemptId: number) {
  const [attempt] = await db
    .select()
    .from(schema.examAttempts)
    .where(eq(schema.examAttempts.id, attemptId))
    .limit(1);
  // ...
}

// Drizzle boolean column in SQLite
isCorrect: integer('is_correct', { mode: 'boolean' })
// Generates 1/0/NULL in SQLite; eq(col, false) generates `is_correct = 0`.
```

### Next.js 16 Client Component params pattern

```tsx
'use client'
import { use } from 'react'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // ...
}
```

Verified from `src/app/(main)/study-dome/bundles/[id]/page.tsx` and official docs.

---

## Phase 0 — Project Bootstrap

> Phase 0 is already completed in prior plans. The repo has a `LICENSE` file and Docker / GitHub Actions are already present. No new scaffolding is needed for this plan.

---

## Phase 1 — Data Layer: Bundle Exam Stats Queries

### Task 1.1: Add `getBundleExamStats` to `db-queries.ts`

**What**: Create a query function that returns all exam attempts for a given bundle plus computed aggregates (total attempts, average/best/worst score, total time spent).

**Files**: `src/lib/db-queries.ts`

**API reference**:

```ts
// Drizzle ORM API — inArray, eq, asc from 'drizzle-orm'
import { eq, inArray, asc, sql } from 'drizzle-orm';
```

**Implementation notes**:

1. Append the function at the bottom of `src/lib/db-queries.ts` alongside the other exam queries.

2. Exact function signature and body:

```ts
export async function getBundleExamStats(db: Db, bundleId: number) {
  const bundleExams = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId))
    .orderBy(asc(schema.exams.createdAt));

  if (bundleExams.length === 0) {
    return {
      exams: [],
      attempts: [],
      totalAttempts: 0,
      completedAttempts: 0,
      avgScore: 0,
      bestScore: 0,
      worstScore: 0,
      totalTimeSeconds: 0,
    };
  }

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(asc(schema.examAttempts.startedAt));

  const completed = attempts.filter((a) => a.attempt.completedAt != null);
  const scores = completed
    .map((a) => a.attempt.score)
    .filter((s): s is number => s != null);

  const totalTimeSeconds = completed.reduce((sum, a) => {
    if (!a.attempt.completedAt || !a.attempt.startedAt) return sum;
    return sum + Math.round((a.attempt.completedAt - a.attempt.startedAt) / 1000);
  }, 0);

  return {
    exams: bundleExams,
    attempts,
    totalAttempts: attempts.length,
    completedAttempts: completed.length,
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    bestScore: scores.length > 0 ? Math.max(...scores) : 0,
    worstScore: scores.length > 0 ? Math.min(...scores) : 0,
    totalTimeSeconds,
  };
}
```

3. Guard against empty `examIds` by returning early — `inArray` with an empty array can produce invalid SQL in some Drizzle versions.

**Tests**:
- Unit testing sql.js client-side functions is not practical. Coverage will be via E2E in Phase 3.
- **Manual verification**: Create a bundle with no exams, call `getBundleExamStats`, assert it returns zeroed stats without throwing.
- **Manual verification**: Create a bundle, create an exam, complete an attempt, assert `avgScore`, `bestScore`, and `totalTimeSeconds` match expectations.

**Commit**: `feat(db): add getBundleExamStats query function`

---

### Task 1.2: Add `getBundleCardWeakness` to `db-queries.ts`

**What**: Create a query function that returns every card in a bundle along with how many times it has been answered incorrectly in exams, sorted by highest incorrect rate.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:

1. Append the function at the bottom of `src/lib/db-queries.ts`.

2. Exact function signature and body:

```ts
export async function getBundleCardWeakness(db: Db, bundleId: number) {
  const cardsInBundle = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, bundleId));

  if (cardsInBundle.length === 0) return [];

  const cardIds = cardsInBundle.map((r) => r.cards.id);

  // Total graded answers per card (exclude ungraded / open answers where isCorrect is NULL)
  const totalAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      total: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        sql`${schema.examAnswers.isCorrect} IS NOT NULL`,
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  // Incorrect answers per card
  const incorrectAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      incorrect: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        eq(schema.examAnswers.isCorrect, false),
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  const totalMap = new Map(totalAnswers.map((r) => [r.cardId, r.total]));
  const incorrectMap = new Map(incorrectAnswers.map((r) => [r.cardId, r.incorrect]));
  const cardMap = new Map(cardsInBundle.map((r) => [r.cards.id, r.cards]));

  return cardsInBundle
    .map((r) => {
      const total = totalMap.get(r.cards.id) ?? 0;
      const incorrect = incorrectMap.get(r.cards.id) ?? 0;
      return {
        card: r.cards,
        total,
        incorrect,
        incorrectRate: total > 0 ? incorrect / total : 0,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.incorrectRate - a.incorrectRate);
}
```

3. Import `and` from `drizzle-orm` if not already imported at the top of the file. (It is already imported.)

**Tests**:
- **Manual verification**: Create a bundle with 3 cards, run an exam where 1 card is answered incorrectly, then call `getBundleCardWeakness`. Assert the incorrectly answered card has `incorrectRate > 0` and appears first.
- **Manual verification**: Bundle with no exam attempts returns empty array.

**Commit**: `feat(db): add getBundleCardWeakness query function`

---

## Phase 2 — UI: Bundle Statistics Page

### Task 2.1: Create `/study-dome/bundles/[id]/stats/page.tsx`

**What**: Build the statistics page that displays summary cards, attempt history, and weak-card analysis for a single bundle.

**Files**:
- `src/app/(main)/study-dome/bundles/[id]/stats/page.tsx` (new)

**API reference**:

```tsx
// Next.js 16 client component params pattern (verified)
'use client'
import { use } from 'react'

export default function BundleStatsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const bundleId = parseInt(id)
  // ...
}
```

**Implementation notes**:

1. Create the route file at exactly:
   `src/app/(main)/study-dome/bundles/[id]/stats/page.tsx`

2. Mark `"use client"` at the top.

3. Imports to use (all already installed and used elsewhere in the app):
   ```tsx
   import { useState, useEffect, useCallback } from "react";
   import Link from "next/link";
   import { use } from "react";
   import {
     RiArrowLeftLine,
     RiBarChartLine,
     RiHistoryLine,
     RiTrophyLine,
     RiTimeLine,
     RiErrorWarningLine,
     RiPlayLine,
   } from "@remixicon/react";
   import { Boxed } from "@/components/boxed";
   import { Button } from "@/components/ui/button";
   import { Badge } from "@/components/ui/badge";
   import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
   import { Progress } from "@/components/ui/progress";
   import { getDb } from "@/db";
   import { getBundleById, getBundleExamStats, getBundleCardWeakness } from "@/lib/db-queries";
   ```

4. Loading state: use `animate-pulse` divs identical to the bundle detail page pattern.

5. Empty state: if the bundle has no exams or no attempts, show a `Card` with `border-dashed` and a message like "No exam data yet. Take an exam to see statistics." with a link back to the bundle.

6. Page sections (top to bottom):
   - **Header**: back arrow link to `/study-dome/bundles/${bundleId}`, title "{bundleTitle} — Statistics", subtitle with card count.
   - **Summary grid** (responsive `grid gap-4 md:grid-cols-4`):
     - Total Attempts (icon: `RiHistoryLine`)
     - Average Score (icon: `RiBarChartLine`) — show as percentage with `Progress` bar
     - Best Score (icon: `RiTrophyLine`) — show as percentage with green tint
     - Total Time (icon: `RiTimeLine`) — format as "Xm Ys"
   - **Attempt History** section:
     - A list of completed attempts. Each item is a `Card` showing:
       - Exam title
       - Date (format with `new Date(attempt.startedAt).toLocaleDateString()`)
       - Score percentage with `Progress` bar colored by score (green ≥70, orange 40–69, red <40)
       - Time taken in minutes/seconds
   - **Weak Cards** section:
     - Only shown if `getBundleCardWeakness` returns items.
     - Header with `RiErrorWarningLine` icon.
     - List of cards with:
       - Card front text (truncated)
       - `Badge` for card type
       - "Answered incorrectly X of Y times"
       - `Progress` bar showing incorrect rate (colored red)
     - If no weakness data, show "All cards are performing well — no weak spots detected."

7. Score color logic:
   ```tsx
   function scoreColorClass(score: number) {
     if (score >= 0.7) return "text-green-600";
     if (score >= 0.4) return "text-orange-500";
     return "text-red-500";
   }
   ```

8. Time formatting helper (reuse the one from results page or inline):
   ```tsx
   function formatDuration(totalSeconds: number) {
     const m = Math.floor(totalSeconds / 60);
     const s = totalSeconds % 60;
     return `${m}m ${s}s`;
   }
   ```

**Tests**:
- E2E coverage in Phase 3.
- **Manual verification**: Navigate to stats page for a bundle with 0 exams → empty state renders.
- **Manual verification**: Navigate to stats page for a bundle with 1 completed attempt → summary cards show correct values, attempt history shows the attempt, weak cards section shows card(s) if any were incorrect.

**Commit**: `feat(stats): add bundle exam statistics page`

---

### Task 2.2: Add "Statistics" link to bundle detail page

**What**: Add a button on the bundle detail page that navigates to the new stats page.

**Files**: `src/app/(main)/study-dome/bundles/[id]/page.tsx`

**Implementation notes**:

1. Import `RiBarChartLine` from `@remixicon/react` at the top of the file.

2. In the header action buttons (next to "Take Exam" and "Add Cards"), add:
   ```tsx
   <Button variant="outline" asChild>
     <Link href={`/study-dome/bundles/${bundleId}/stats`}>
       <RiBarChartLine className="mr-2 h-4 w-4" />
       Statistics
     </Link>
   </Button>
   ```

3. The button should appear whether or not the bundle has cards, but ideally it can be disabled if `cards.length === 0` (no point in stats with no cards). However, keeping it enabled is fine since the stats page handles empty states gracefully.

**Tests**:
- **Manual verification**: Open a bundle detail page → "Statistics" button is visible and clickable → navigates to `/study-dome/bundles/{id}/stats`.

**Commit**: `feat(stats): add statistics link on bundle detail page`

---

## Phase 3 — End-to-End Testing

### Task 3.1: E2E test — bundle exam statistics flow

**What**: Add a Playwright E2E test that creates cards, bundles them, takes an exam with mixed correctness, and verifies the statistics page reflects the expected data.

**Files**: `e2e/bundle-stats.spec.ts` (new)

**Implementation notes**:

1. Follow the exact patterns from `e2e/exam-flow.spec.ts` and `e2e/setup.ts`.

2. Test steps:

```ts
import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("bundle stats page shows exam history and weak cards", async ({ page }) => {
  // 1. Create 3 multi_radio cards (same as exam-flow.spec.ts)
  for (let i = 1; i <= 3; i++) {
    await page.goto("/study-dome/cards/new");
    await page.waitForLoadState("networkidle");
    await page.click("label[for='type-multi-radio']");
    await page.click("button:has-text('Add Option')");
    await page.waitForTimeout(100);
    await page.fill("#front", `Question ${i}`);
    await page.fill("#back", `Answer ${i}`);
    const opts = page.locator("input[placeholder^='Option']");
    await opts.nth(0).fill("Option A");
    await opts.nth(1).fill("Option B");
    await page.locator("input[type='radio']").nth(0).check();
    await page.click("button:has-text('Create Card')");
    await page.waitForURL(/\/study-dome\/cards/);
  }

  // 2. Create bundle
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", "Stats Test Bundle");
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");
  const bundleUrl = page.url();
  const bundleId = bundleUrl.match(/\/study-dome\/bundles\/(\d+)/)?.[1];
  expect(bundleId).toBeTruthy();

  // 3. Add all cards to bundle
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(800);
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const cardDivs = dialog.locator("div.cursor-pointer");
  const cardCount = await cardDivs.count();
  for (let i = 0; i < cardCount; i++) {
    await cardDivs.nth(i).click();
  }
  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
    await addBtn.click();
  }
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForLoadState("networkidle");

  // 4. Start exam
  await page.click("button:has-text('Take Exam')");
  await page.waitForTimeout(500);
  const examDialog = page.getByRole("dialog");
  await expect(examDialog).toBeVisible({ timeout: 5000 });
  await examDialog.getByRole("button", { name: "Start Exam" }).click();
  await page.waitForURL(/\/study-dome\/exams\/\d+/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // 5. Answer questions: correct, incorrect, correct
  // Q1 — correct (option A, index 0)
  await page.locator("label[id^='q-opt-']").nth(0).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Q2 — incorrect (option B, index 1)
  await page.locator("label[id^='q-opt-']").nth(1).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Q3 — correct (option A, index 0)
  await page.locator("label[id^='q-opt-']").nth(0).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Submit Exam')").click();
  await page.waitForURL(/\/study-dome\/exams\/\d+\/results/);
  await page.waitForLoadState("networkidle");

  // 6. Navigate to stats page
  await page.goto(`/study-dome/bundles/${bundleId}/stats`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);

  // 7. Assertions
  await expect(page.getByText("Statistics").first()).toBeVisible();
  // Total attempts = 1
  await expect(page.getByText("1").first()).toBeVisible();
  // Average score should be 67% (2/3 correct)
  await expect(page.getByText(/67/)).toBeVisible();
  // Attempt history section visible
  await expect(page.getByText("Attempt History")).toBeVisible();
  // Weak cards section should show the incorrectly answered card
  await expect(page.getByText("Weak Cards")).toBeVisible();
  await expect(page.getByText("Question 2")).toBeVisible();
});
```

3. Notes on selectors:
   - The exam page uses labels with `id="q-opt-{index}"` for options. Verify this by checking `src/app/(main)/study-dome/exams/[attemptId]/page.tsx` if the test fails — adjust selector accordingly.
   - If the exact label `id` prefix differs, use `page.locator("label").nth(0)` instead.

**Tests**:
- Run `pnpm exec playwright test e2e/bundle-stats.spec.ts` and ensure it passes.
- If flakiness occurs, add `await page.waitForTimeout(300)` after navigation steps.

**Commit**: `test(e2e): add bundle statistics page flow test`

---

## Phase 4 — Documentation & Polish

### Task 4.1: Update architecture docs

**What**: Document the new statistics page in `docs/architecture.md` under the Study Dome section.

**Files**: `docs/architecture.md`

**Implementation notes**:

1. Add a short subsection under the Study Dome heading (or create one if it doesn't exist) describing:
   - Route: `/study-dome/bundles/[id]/stats`
   - Data sources: `getBundleExamStats` and `getBundleCardWeakness`
   - What is shown: summary aggregates, attempt history, per-card weakness analysis
   - Purpose: helps students track exam performance over time and identify cards that need more review

2. Keep it brief — one short paragraph is enough.

**Commit**: `docs: document bundle exam statistics page in architecture`

---

## Execution Checklist

- [x] License: already present (`LICENSE` file committed).
- [x] Docker/CI: already present (`.github/workflows/`, `docker-compose.yml`).
- [x] Research phase completed — Next.js 16 params pattern verified, Drizzle ORM join patterns verified from existing `db-queries.ts`, schema verified from `src/db/schema.ts`.
- [x] Every library reference traces to source: Drizzle APIs from existing code, Remix icons from existing imports, Next.js patterns from `node_modules/next/dist/docs/`.
- [x] Every task has a **Tests** subsection.
- [x] E2E testing phase exists with concrete scenario.
- [x] Every task ends with a **Commit** line.
- [x] README remains slim — no changes needed.
- [x] All docs under `docs/`.
- [x] `pnpm dlx` / `pnpm exec` used instead of `npx`.
