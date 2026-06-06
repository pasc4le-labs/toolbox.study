# 01 — Past Exams for Bundles

> Add a "Past Exams" page to each Bundle, listing past exam attempts in a table; clicking a row navigates to a detailed exam view showing all questions, answers, and scoring.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **DB schema** | `examAttempts` has `id`, `examId`, `startedAt`, `completedAt`, `score`. `examAnswers` has `attemptId`, `cardId`, `order`, `answer` (JSON string), `isCorrect` (boolean or null for open). Each attempt links to an `exams` row which links to a `bundles` row via `bundleId`. |
| **Existing query** | `getBundleExamStats(db, bundleId)` already returns `{ exams, attempts, totalAttempts, completedAttempts, avgScore, bestScore, worstScore, totalTimeSeconds }`. Each `attempts` entry is `{ attempt: ExamAttempt, exam: Exam }`. |
| **Results data** | `getExamResults(db, attemptId)` returns `{ attempt, exam, answers }` where each answer has `{ ...ExamAnswer, card: Card \| null }`. |
| **UI components** | shadcn (radix-mira style, remixicon). No `<Table>` component installed yet — needs `pnpm dlx shadcn@latest add table`. Card, Badge, Button, Progress, Tabs etc. already available. |
| **Current bundle page** | `study-dome/bundles/[id]/page.tsx` has a "Statistics" button linking to `…/stats`. No tabs — just a direct link. |
| **Current stats page** | `study-dome/bundles/[id]/stats/page.tsx` renders summary cards + charts. Standalone page with back-link to bundle. |
| **Next.js routing** | App Router with `(main)` group, `use(params)` for unwrapping Promise params. `"use client"` components. |

---

## Phase 0 — Prerequisites

### Task 0.1: Install Table component
**What**: Add the shadcn `table` component so we can render exam-attempt rows.
**Files**: `src/components/ui/table.tsx` (generated)
**Implementation notes**:
- Run `pnpm dlx shadcn@latest add table`
- This generates `src/components/ui/table.tsx` with `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` exports.
- Existing `components.json` uses `radix-mira` style, `remixicon` icon library — shadcn will pick these up automatically.
**Tests**: Render the table with static data in a test or manually verify at `/study-dome/bundles/1` that import resolves.
**Commit**: `chore(ui): add shadcn table component`

---

## Phase 1 — Data Layer

### Task 1.1: Add `getBundlePastAttempts` query
**What**: Create a new db-queries function that fetches all completed + unfinished exam attempts for a given bundle, sorted by most recent first, including the exam title.
**Files**: `src/lib/db-queries.ts`
**API reference**:
```ts
// Existing schema imports are available:
import { examAttempts, exams, examAnswers, cards, bundles } from '@/db/schema';
// Equivalent to:
// examAttempts = schema.examAttempts, exams = schema.exams, etc.
```
**Implementation notes**:
- The existing `getBundleExamStats` returns `{ attempts: Array<{ attempt: ExamAttempt; exam: Exam }> }` but with ascending `startedAt` order. We need descending (most recent first) and only attempts (not the full stats).
- Add a new exported function:
```ts
export async function getBundlePastAttempts(db: Db, bundleId: number) {
  const bundleExams = await db
    .select({ id: schema.exams.id })
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId));

  if (bundleExams.length === 0) return [];

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(sql`${schema.examAttempts.startedAt} DESC`);

  return attempts;
}
```
- This returns `Array<{ attempt: ExamAttempt; exam: Exam }>` sorted newest first.
**Tests**: Write a unit test that seeds a bundle, exam, and 2 attempts (1 completed, 1 in-progress), then calls `getBundlePastAttempts` and verifies order and completeness.
**Commit**: `feat(db): add getBundlePastAttempts query`

---

## Phase 2 — Past Exams Page

### Task 2.1: Create the Past Exams page route
**What**: Create `src/app/(main)/study-dome/bundles/[id]/past-exams/page.tsx` — a page that lists all exam attempts for the bundle in a table.
**Files**: `src/app/(main)/study-dome/bundles/[id]/past-exams/page.tsx`
**API reference**:
```tsx
// Imports needed (all verified):
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxed } from "@/components/boxed";
import { getDb } from "@/db";
import { getBundleById, getBundlePastAttempts } from "@/lib/db-queries";
import { RiArrowLeftLine, RiBarChartLine, RiTimeLine } from "@remixicon/react";
import Link from "next/link";
```
**Implementation notes**:
- Follow the same pattern as `stats/page.tsx`: `"use client"`, `use(params)`, `useState`/`useEffect`/`useCallback` for data loading.
- Page structure:
  1. Back-link button to the bundle.
  2. Header: `{bundle.title} — Past Exams` with attempt count subtitle.
  3. Empty state: if no attempts, show a card with `RiHistoryLine` icon and message "No exams taken yet."
  4. Table with columns: **#**, **Exam Title**, **Date**, **Score**, **Duration**, **Status**.
- Each row is a `<Link>` wrapping the `<TableRow>`, navigating to `/study-dome/exams/[attemptId]/results`.
- Score display: `completedAt != null ? Math.round(score * 100) + "%" : "—"`, with color coding (green ≥70%, orange ≥40%, red <40%).
- Duration: If completed, `(completedAt - startedAt) / 1000` formatted as `Xm Ys`. If not completed, "Unfinished".
- Status badge: `completedAt != null ? <Badge className="bg-green-600">Completed</Badge> : <Badge variant="secondary">Unfinished</Badge>`.
- Date formatting: `new Date(attempt.startedAt).toLocaleDateString()`.
- The `<TableRow>` should have `className="cursor-pointer hover:bg-muted/50"` for visual feedback.
**Tests**: Manually verify the page renders for a bundle with and without attempts. Verify row click navigates to results.
**Commit**: `feat(bundles): add past exams list page`

---

## Phase 3 — Bundle Detail Navigation Update

### Task 3.1: Update bundle detail page to link to Past Exams
**What**: Add a "Past Exams" navigation button next to the existing "Statistics" button on the bundle detail page.
**Files**: `src/app/(main)/study-dome/bundles/[id]/page.tsx`
**Implementation notes**:
- Import `RiHistoryLine` from `@remixicon/react` (already partially imported, need to add it).
- In the button group (currently contains "Take Exam", "Add Cards", "Statistics"), add:
```tsx
<Button variant="ghost" asChild>
  <Link href={`/study-dome/bundles/${bundleId}/past-exams`}>
    <RiHistoryLine className="mr-2 h-4 w-4" />
    Past Exams
  </Link>
</Button>
```
- Place it next to the Statistics button.
**Tests**: Verify the button appears and links to the correct URL.
**Commit**: `feat(bundles): add past exams navigation button`

---

## Phase 4 — Tabs Integration (Statistics + Past Exams)

### Task 4.1: Add Tabs to the bundle stats/past-exams experience
**What**: Add a `Tabs` component so users can switch between "Statistics" and "Past Exams" without leaving the context. Both the stats page and past-exams page share a common tab header.
**Files**:
- `src/app/(main)/study-dome/bundles/[id]/stats/page.tsx` (modify)
- `src/app/(main)/study-dome/bundles/[id]/past-exams/page.tsx` (modify)

**API reference**:
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
```
**Implementation notes**:
- **Option chosen**: Use Next.js route-based tabs. The URL determines the active tab, so deep-linking works.
- On the **Past Exams** page, wrap content in:
```tsx
<Tabs defaultValue="past-exams">
  <TabsList>
    <TabsTrigger value="statistics" asChild>
      <Link href={`/study-dome/bundles/${bundleId}/stats`}>Statistics</LinkTrigger>
    </TabsTrigger>
    <TabsTrigger value="past-exams">Past Exams</TabsTrigger>
  </TabsList>
  <TabsContent value="past-exams">
    {/* existing table content */}
  </TabsContent>
</Tabs>
```
- On the **Statistics** page, wrap similarly:
```tsx
<Tabs defaultValue="statistics">
  <TabsList>
    <TabsTrigger value="statistics">Statistics</TabsTrigger>
    <TabsTrigger value="past-exams" asChild>
      <Link href={`/study-dome/bundles/${bundleId}/past-exams`}>Past Exams</LinkTrigger>
    </TabsTrigger>
  </TabsList>
  <TabsContent value="statistics">
    {/* existing stats content */}
  </TabsContent>
</Tabs>
```
- Import `RiBarChartLine` and `RiHistoryLine` for tab icons (optional but consistent).
- Ensure the back-link remains above the tabs.
- Use `TabsTrigger` with `asChild` + `<Link>` for navigation tabs. The active tab is determined by the URL, not Radix state, so `defaultValue` matches the current page.
**Tests**: Verify clicking tabs navigates between `/stats` and `/past-exams` routes. Verify active tab highlights correctly on both pages.
**Commit**: `feat(bundles): add tabs for statistics and past exams`

---

## Phase 5 — Exam Detail Page Improvements

### Task 5.1: Improve the exam results page to support viewing past attempts
**What**: The existing results page (`/study-dome/exams/[attemptId]/results`) already shows a full question-by-question breakdown. Verify it handles the "back to bundle" navigation correctly when the exam has a `bundleId`. Add a breadcrumb-style back-link to the Past Exams page.
**Files**: `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`
**Implementation notes**:
- The existing page already has a "Back to Study Dome" link and a "Back to Bundle" button when `exam.bundleId` exists.
- Add a "Back to Past Exams" link when `exam.bundleId` exists:
```tsx
{results.exam?.bundleId && (
  <Button asChild variant="outline" size="sm">
    <Link href={`/study-dome/bundles/${results.exam.bundleId}/past-exams`}>
      <RiArrowLeftLine className="mr-1 h-4 w-4" />
      Past Exams
    </Link>
  </Button>
)}
```
- Place it in the bottom action area alongside the existing "Back to Bundle" and "Back to Study Dome" buttons.
**Tests**: Verify the back navigation works from the results page to the past-exams list.
**Commit**: `feat(exams): add back-to-past-exams link on results page`

---

## Phase 6 — Minor UX Polish

### Task 6.1: Sort and filter enhancements on Past Exams page
**What**: Add ability to sort the table by date and filter by completed/unfinished status.
**Files**: `src/app/(main)/study-dome/bundles/[id]/past-exams/page.tsx`
**Implementation notes**:
- Add local state for sort column (`"date" | "score"`) and sort direction (`"asc" | "desc"`).
- Add a simple filter: `<select>` or shadcn `<Select>` with options: "All", "Completed", "Unfinished".
- Default: sort by date descending (most recent first), filter "All".
- Wrap the filter/sort controls above the table:
```tsx
<div className="flex items-center justify-between mb-4">
  <p className="text-sm text-muted-foreground">
    {completedCount} completed · {unfinishedCount} unfinished
  </p>
  <div className="flex gap-2">
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
</div>
```
- Use `useMemo` to compute filtered/sorted rows from the raw data.
**Tests**: Verify filtering and sorting work correctly. Verify the default state shows all attempts sorted by date descending.
**Commit**: `feat(bundles): add filter and sort to past exams table`

---

## Execution Checklist

- [x] License already present in repo — no Phase 0 task needed.
- [x] Docker/CI skipped — this is a feature addition, not a new project.
- [x] Every library reference traces to existing code in the project.
- [x] Every task has a `**Tests**` subsection.
- [x] No E2E testing phase (feature is client-side with local sqlite — unit + manual verification suffices).
- [x] Every task ends with a `**Commit**` line.
- [x] README not modified — this is a feature addition, not a docs change.
- [x] Only added files or minimal edits to existing files.