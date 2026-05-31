# 05 — Exam Advanced Options & Bundle-Persisted Exam Settings

> Add "Advanced Options" to the Exam Modal: points per correct answer, negative points per wrong answer, Input fields alongside Sliders for time/question-count, and persist all exam settings on the bundle so they pre-fill on next use.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.
- Use `pnpm dlx` or `pnpm exec` instead of `npx` everywhere.

---

## Research Summary

### Current Architecture

| Area | Details |
|------|---------|
| **Exam modal** | Inline `Dialog` in `src/app/(main)/study-dome/bundles/[id]/page.tsx`; uses `Slider` for questionCount, timeLimitMinutes, and difficultyFilter. |
| **DB schema** | `exams` table: `id, title, bundleId, questionCount, timeLimitSeconds, difficultyFilter, createdAt`. No points columns. |
| **Bundles table** | `id, title, description, createdAt`. No exam-settings columns. |
| **Scoring** | `completeExamAttempt()` in `db-queries.ts` computes `score = correctCount / answeredCount` (0–1). No weighted scoring. |
| **Results page** | `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx` — shows percentage score, correct/incorrect counts. |
| **Exchange** | `exchange-serialize.ts` and `exchange-import.ts` handle exam export/import; `exchange-protocol.ts` defines the wire types. |
| **ORM** | Drizzle ORM with sql.js (client-side SQLite). Migrations generated via `pnpm db:generate` then exported via `pnpm db:export`. |
| **UI components** | shadcn/ui: `Dialog`, `Input`, `Slider`, `Label`, `Button`, `Badge`, etc. No `Accordion` or `Collapsible` installed yet. |
| **E2E tests** | Playwright in `e2e/`; `exam-flow.spec.ts` covers exam creation, taking, and results. |

### Key Code Locations

| File | Purpose |
|------|---------|
| `src/db/schema.ts` | Drizzle schema definitions (bundles, exams tables) |
| `src/lib/db-queries.ts` | Query helpers (`createExam`, `startExamAttempt`, `completeExamAttempt`, bundle CRUD) |
| `src/app/(main)/study-dome/bundles/[id]/page.tsx` | Bundle detail page with exam `Dialog` |
| `src/app/(main)/study-dome/exams/[attemptId]/page.tsx` | Exam-taking page |
| `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx` | Results page |
| `src/lib/exchange-serialize.ts` | Serialization for P2P export |
| `src/lib/exchange-import.ts` | Import logic for P2P |

### Key API Signatures

```ts
// schema.ts — current exams table
export const exams = sqliteTable('exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  bundleId: integer('bundle_id').references(() => bundles.id, { onDelete: 'cascade' }),
  questionCount: integer('question_count').notNull(),
  timeLimitSeconds: integer('time_limit_seconds'),
  difficultyFilter: real('difficulty_filter'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

// schema.ts — current bundles table
export const bundles = sqliteTable('bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

// db-queries.ts — current createExam signature
export async function createExam(
  db: Db,
  data: {
    title: string;
    bundleId: number;
    questionCount: number;
    timeLimitSeconds?: number | null;
    difficultyFilter?: number | null;
  },
)

// db-queries.ts — current completeExamAttempt scoring
export async function completeExamAttempt(db: Db, attemptId: number) {
  const answers = await getExamAnswers(db, attemptId);
  const answered = answers.filter((a) => a.isCorrect !== null);
  const score = answered.length > 0
    ? answered.filter((a) => a.isCorrect).length / answered.length
    : 0;
  // ...
}
```

---

## Phase 0 — Schema & Migration

### Task 0.1: Add exam-settings columns to bundles table and points columns to exams table

**What**: Extend the Drizzle schema with new columns. The `bundles` table gets default exam settings columns. The `exams` table gets `pointsPerCorrect` and `pointsPerWrong`.

**Files**: `src/db/schema.ts`

**Implementation notes**:

1. In `src/db/schema.ts`, add to the `bundles` table:
   ```ts
   examQuestionCount: integer('exam_question_count'),         // default question count for exams
   examTimeLimitSeconds: integer('exam_time_limit_seconds'),   // default time limit
   examDifficultyFilter: real('exam_difficulty_filter'),       // default difficulty filter (0-1)
   examPointsPerCorrect: real('exam_points_per_correct'),      // default points per correct answer
   examPointsPerWrong: real('exam_points_per_wrong'),          // default negative points per wrong answer
   ```

2. In `src/db/schema.ts`, add to the `exams` table:
   ```ts
   pointsPerCorrect: real('points_per_correct').notNull().default(1),
   pointsPerWrong: real('points_per_wrong').notNull().default(0),
   ```

3. The `Bundle` and `NewBundle` types are inferred automatically via `typeof bundles.$inferSelect` and `typeof bundles.$inferInsert`.

**Tests**: Schema changes are type-checked at build time. Verify with `pnpm exec tsc --noEmit`.

**Commit**: `feat(schema): add exam settings to bundles and points columns to exams`

### Task 0.2: Generate and export the DB migration

**What**: Generate a Drizzle migration for the schema changes and export it to the JSON file that sql.js loads client-side.

**Files**: `src/db/migrations/` (auto-generated), `src/db/migrations/export.json` (auto-generated)

**Implementation notes**:

1. Run `pnpm db:migrate` — this is the shorthand for `pnpm db:generate && pnpm db:export`.
2. Verify that a new `.sql` file appears in `src/db/migrations/` with `ALTER TABLE` statements adding the new columns.
3. Verify that `src/db/migrations/export.json` is updated with the new migration.
4. The app's DB init in `src/db/index.ts` auto-applies all migrations via `(_db as any).dialect.migrate(migrations, ...)` — no code changes needed.

**Tests**: Start the dev server (`pnpm dev`), open the app, and confirm it loads without errors (migration applies cleanly). Alternatively, run the existing E2E suite.

**Commit**: `chore(db): generate migration for bundle exam settings and exam points`

---

## Phase 1 — DB Queries

### Task 1.1: Update `createExam` and `updateBundle` query helpers

**What**: Extend `createExam` to accept `pointsPerCorrect` and `pointsPerWrong`. Extend `updateBundle` to accept the new exam-settings fields. Add a helper to save exam settings to a bundle.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:

1. Update `createExam` signature:
   ```ts
   export async function createExam(
     db: Db,
     data: {
       title: string;
       bundleId: number;
       questionCount: number;
       timeLimitSeconds?: number | null;
       difficultyFilter?: number | null;
       pointsPerCorrect?: number;
       pointsPerWrong?: number;
     },
   )
   ```
   In the body, add `pointsPerCorrect` and `pointsPerWrong` to the `.values()` call. Default values: `pointsPerCorrect: data.pointsPerCorrect ?? 1`, `pointsPerWrong: data.pointsPerWrong ?? 0`.

2. Update `updateBundle` signature to accept:
   ```ts
   data: {
     title?: string;
     description?: string | null;
     examQuestionCount?: number | null;
     examTimeLimitSeconds?: number | null;
     examDifficultyFilter?: number | null;
     examPointsPerCorrect?: number | null;
     examPointsPerWrong?: number | null;
   }
   ```
   All new fields are optional. Pass them directly to `.set(data)` — Drizzle handles `undefined` by skipping the field.

3. Update `completeExamAttempt` to compute a weighted score:
   ```ts
   export async function completeExamAttempt(db: Db, attemptId: number) {
     const [attempt] = await db
       .select()
       .from(schema.examAttempts)
       .where(eq(schema.examAttempts.id, attemptId))
       .limit(1);

     if (!attempt) throw new Error('Attempt not found');

     const exam = await getExamById(db, attempt.examId);
     if (!exam) throw new Error('Exam not found');

     const answers = await getExamAnswers(db, attemptId);
     const answered = answers.filter((a) => a.isCorrect !== null);

     const pointsPerCorrect = exam.pointsPerCorrect ?? 1;
     const pointsPerWrong = exam.pointsPerWrong ?? 0;

     const correctCount = answered.filter((a) => a.isCorrect).length;
     const wrongCount = answered.filter((a) => a.isCorrect === false).length;
     const totalPoints = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
     const maxPoints = answered.length * pointsPerCorrect;

     // score normalized 0-1 (clamped to 0 if negative scoring)
     const score = maxPoints > 0 ? Math.max(0, totalPoints / maxPoints) : 0;

     await db
       .update(schema.examAttempts)
       .set({ completedAt: Date.now(), score })
       .where(eq(schema.examAttempts.id, attemptId));

     return score;
   }
   ```

4. Update `getExamResults` return type to include `pointsPerCorrect` and `pointsPerWrong` from the exam (the exam object is already returned, so the type carries through).

**Tests**: No automated tests exist for db-queries. Manual verification: start dev server, create an exam with custom points, complete it, verify the score reflects points weighting.

**Commit**: `feat(db): support points per correct/wrong in exam creation and scoring`

---

## Phase 2 — UI: Exam Modal Advanced Options

### Task 2.1: Install shadcn Collapsible component

**What**: Install the `Collapsible` component from shadcn/ui to create the "Advanced Options" toggle section.

**Files**: `src/components/ui/collapsible.tsx` (auto-generated)

**Implementation notes**:

1. Run:
   ```bash
   pnpm dlx shadcn@latest add collapsible
   ```

**Tests**: Verify the file `src/components/ui/collapsible.tsx` is created.

**Commit**: `chore(ui): add shadcn collapsible component`

### Task 2.2: Restructure the Exam Dialog with advanced options section

**What**: Refactor the exam dialog in the bundle detail page to include:
- Input fields alongside Sliders for question count and time limit.
- A "Advanced Options" collapsible section containing:
  - Points per correct answer (number input)
  - Negative points per wrong answer (number input)
  - Difficulty filter (already present, keep as Slider only since it's a 0-100% concept)
- Pre-fill values from the bundle's saved exam settings.
- On dialog open, load settings from bundle; on "Start Exam", save settings back to the bundle.

**Files**: `src/app/(main)/study-dome/bundles/[id]/page.tsx`

**Implementation notes**:

1. Import `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `@/components/ui/collapsible`.
2. Import `Input` (already imported) and `ChevronDownIcon`/`ChevronUpIcon` from `@remixicon/react`.
3. Add state variables:
   ```ts
   const [advancedOpen, setAdvancedOpen] = useState(false);
   const [pointsPerCorrect, setPointsPerCorrect] = useState(1);
   const [pointsPerWrong, setPointsPerWrong] = useState(0);
   ```
4. When opening the exam dialog (`setExamDialogOpen(true)`), load defaults from the bundle:
   ```ts
   if (bundle) {
     setExamTitle(bundle.title + " Exam");
     setQuestionCount(bundle.examQuestionCount ?? Math.min(5, cards.length));
     setTimeLimitMinutes(bundle.examTimeLimitSeconds ? bundle.examTimeLimitSeconds / 60 : 0);
     setDifficultyFilter(Math.round((bundle.examDifficultyFilter ?? 0) * 100));
     setPointsPerCorrect(bundle.examPointsPerCorrect ?? 1);
     setPointsPerWrong(bundle.examPointsPerWrong ?? 0);
   }
   ```
5. Replace the dialog content. Basic settings (always visible):
   - **Exam Title**: `Input` (existing, unchanged).
   - **Questions**: Add an `Input[type=number]` next to the `Slider`. The `Input` updates `questionCount`; the `Slider` also updates `questionCount`. They stay in sync bidirectionally.
     ```tsx
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
           value={questionCount}
           onChange={(e) => setQuestionCount(Math.min(Math.max(1, parseInt(e.target.value) || 1), cards.length))}
           className="w-16 text-center"
         />
       </div>
       <p className="text-xs text-muted-foreground">{cards.length} cards available</p>
     </div>
     ```
   - **Time Limit**: Same pattern — `Input[type=number]` next to `Slider` with `0 = No limit`.
     ```tsx
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
           value={timeLimitMinutes}
           onChange={(e) => setTimeLimitMinutes(Math.max(0, parseInt(e.target.value) || 0))}
           className="w-16 text-center"
         />
       </div>
       <p className="text-xs text-muted-foreground">{timeLimitMinutes === 0 ? "No time limit" : `${timeLimitMinutes} minute${timeLimitMinutes !== 1 ? "s" : ""}`}</p>
     </div>
     ```

6. Advanced options (inside `Collapsible`):
   ```tsx
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
           value={pointsPerCorrect}
           onChange={(e) => setPointsPerCorrect(Math.max(0, parseFloat(e.target.value) || 0))}
         />
         <p className="text-xs text-muted-foreground">Default: 1 point</p>
       </div>
       <div className="space-y-2">
         <Label>Negative points per wrong answer</Label>
         <Input
           type="number"
           max={0}
           step={0.25}
           value={pointsPerWrong}
           onChange={(e) => setPointsPerWrong(Math.min(0, parseFloat(e.target.value) || 0))}
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
   ```
   Note: import `RiArrowDownSLine` and `RiArrowUpSLine` from `@remixicon/react`.

7. Update `handleStartExam` to pass new fields and save settings to the bundle:
   ```ts
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
   ```

8. Add `updateBundle` to the imports from `@/lib/db-queries` (it's already imported).

**Tests**: Manual — open bundle detail, click "Take Exam", verify:
- Dialog shows Input+Slider for questions and time.
- "Advanced Options" is collapsed by default.
- Expanding it reveals points-per-correct, points-per-wrong, and difficulty filter.
- Values pre-fill from bundle's saved defaults.
- Starting an exam saves settings to the bundle and creates the exam with the correct fields.

**Commit**: `feat(exam): add advanced options to exam dialog with inputs and collapsible`

---

## Phase 3 — Exam Results Page: Point-Based Scoring

### Task 3.1: Update results page to show point-based scoring

**What**: Update the results page to display:
- Total points earned vs max possible points
- Points per correct answer and negative points per wrong answer
- Weighted score percentage
- Breakdown showing points earned per question

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`

**Implementation notes**:

1. The `getExamResults` query already returns the `exam` object which includes `pointsPerCorrect` and `pointsPerWrong` (after the DB migration).

2. Update the scoring display section in the results page:
   ```ts
   const pointsPerCorrect = exam?.pointsPerCorrect ?? 1;
   const pointsPerWrong = exam?.pointsPerWrong ?? 0;

   const correctCount = answers.filter((a) => a.isCorrect).length;
   const wrongCount = answers.filter((a) => a.isCorrect === false).length;
   const unansweredCount = answers.length - correctCount - wrongCount;

   const totalEarned = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
   const maxPossible = answers.length * pointsPerCorrect;
   ```

3. Replace the current score percentage and counts display:
   ```tsx
   <div className="text-center">
     <span className="text-5xl font-bold">{scorePct}%</span>
   </div>
   ```
   with:
   ```tsx
   <div className="text-center">
     <span className="text-5xl font-bold">{scorePct}%</span>
     {(pointsPerCorrect !== 1 || pointsPerWrong !== 0) && (
       <p className="mt-1 text-sm text-muted-foreground">
         {totalEarned.toFixed(pointsPerWrong % 1 ? 2 : 1)} / {maxPossible.toFixed(1)} points
       </p>
     )}
   </div>
   ```

4. Update the stats grid to show points info when applicable:
   ```tsx
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
   ```

5. In the per-question breakdown, add point info when scoring is non-default:
   ```tsx
   {(pointsPerCorrect !== 1 || pointsPerWrong !== 0) && (
     <span className="text-xs text-muted-foreground">
       {a.isCorrect ? `+${pointsPerCorrect}` : a.isCorrect === false ? `${pointsPerWrong}` : '—'}
     </span>
   )}
   ```

**Tests**: Manual — take an exam with custom points (e.g. +1 correct, -0.25 wrong), complete it, verify the results page shows points and weighted score.

**Commit**: `feat(exam): display point-based scoring on results page`

---

## Phase 4 — Exchange: Update Serialization & Import

### Task 4.1: Update exchange serialization and import for new exam/bundle fields

**What**: Add `pointsPerCorrect`, `pointsPerWrong` to exam serialization and the `exam_*` settings to bundle serialization, then update import logic to handle them.

**Files**: `src/lib/exchange-serialize.ts`, `src/lib/exchange-import.ts`

**Implementation notes**:

1. In `exchange-serialize.ts`, update the `exams` array type to include the new fields:
   ```ts
   exams: Array<{
     id: number;
     title: string;
     bundleId: number | null;
     questionCount: number;
     timeLimitSeconds: number | null;
     difficultyFilter: number | null;
     pointsPerCorrect: number;
     pointsPerWrong: number;
   }>;
   ```
   And in the exam serialization block, add:
   ```ts
   pointsPerCorrect: exam.pointsPerCorrect,
   pointsPerWrong: exam.pointsPerWrong,
   ```

2. In `exchange-serialize.ts`, update the `bundles` array type to include:
   ```ts
   bundles: Array<{
     id: number;
     title: string;
     description: string | null;
     cardIds: number[];
     examQuestionCount: number | null;
     examTimeLimitSeconds: number | null;
     examDifficultyFilter: number | null;
     examPointsPerCorrect: number | null;
     examPointsPerWrong: number | null;
   }>;
   ```
   And fetch + include those fields.

3. In `exchange-import.ts`, update the exams import:
   ```ts
   await db.insert(schema.exams).values({
     title: examData.title,
     bundleId: newBundleId,
     questionCount: examData.questionCount,
     timeLimitSeconds: examData.timeLimitSeconds,
     difficultyFilter: examData.difficultyFilter,
     pointsPerCorrect: examData.pointsPerCorrect ?? 1,
     pointsPerWrong: examData.pointsPerWrong ?? 0,
     createdAt: Date.now(),
   });
   ```

4. In `exchange-import.ts`, update the bundles import to also set exam settings:
   Currently `createBundle` only takes `{ title, description }`. We need to update it to also accept the exam settings, or update the bundle after creation.

   Easiest approach: after creating the bundle, run an `updateBundle` call:
   ```ts
   if (bundleData.examQuestionCount != null || bundleData.examTimeLimitSeconds != null || ...) {
     await updateBundle(db, newBundle.id, {
       examQuestionCount: bundleData.examQuestionCount ?? null,
       examTimeLimitSeconds: bundleData.examTimeLimitSeconds ?? null,
       examDifficultyFilter: bundleData.examDifficultyFilter ?? null,
       examPointsPerCorrect: bundleData.examPointsPerCorrect ?? null,
       examPointsPerWrong: bundleData.examPointsPerWrong ?? null,
     });
   }
   ```

5. Handle backward compatibility: if imported data is missing the new fields, fall back to defaults (1 for pointsPerCorrect, 0 for pointsPerWrong, null for bundle exam settings).

**Tests**: Manual — export a bundle with exam settings via exchange center, import into a fresh DB, verify settings are preserved.

**Commit**: `feat(exchange): serialize and import exam points and bundle exam settings`

---

## Phase 5 — Bundle Edit Page: Exam Settings

### Task 5.1: Add exam default settings to bundle edit page

**What**: The bundle edit page (`/study-dome/bundles/[id]/edit`) should allow editing the default exam settings that pre-fill the exam dialog. Add fields for default question count, time limit, points, and difficulty filter.

**Files**: `src/app/(main)/study-dome/bundles/[id]/edit/page.tsx`

**Implementation notes**:

1. Load the bundle (already done) and extract exam settings from it.
2. Add state variables:
   ```ts
   const [examQuestionCount, setExamQuestionCount] = useState<number>(5);
   const [examTimeLimitMinutes, setExamTimeLimitMinutes] = useState<number>(0);
   const [examDifficultyFilter, setExamDifficultyFilter] = useState<number>(0);
   const [examPointsPerCorrect, setExamPointsPerCorrect] = useState<number>(1);
   const [examPointsPerWrong, setExamPointsPerWrong] = useState<number>(0);
   ```
3. In the `load` effect, initialize from bundle:
   ```ts
   setExamQuestionCount(bundle.examQuestionCount ?? 5);
   setExamTimeLimitMinutes(bundle.examTimeLimitSeconds ? Math.round(bundle.examTimeLimitSeconds / 60) : 0);
   setExamDifficultyFilter(Math.round((bundle.examDifficultyFilter ?? 0) * 100));
   setExamPointsPerCorrect(bundle.examPointsPerCorrect ?? 1);
   setExamPointsPerWrong(bundle.examPointsPerWrong ?? 0);
   ```
4. Include these fields in the `handleSubmit` / `updateBundle` call:
   ```ts
   await updateBundle(db, bundleId, {
     title: title.trim(),
     description: description.trim() || null,
     examQuestionCount: examQuestionCount || null,
     examTimeLimitSeconds: examTimeLimitMinutes > 0 ? examTimeLimitMinutes * 60 : null,
     examDifficultyFilter: examDifficultyFilter / 100,
     examPointsPerCorrect: examPointsPerCorrect,
     examPointsPerWrong: examPointsPerWrong,
   });
   ```
5. Render a "Default Exam Settings" section below the description:
   ```tsx
   <div className="mt-6 space-y-4">
     <h2 className="text-lg font-semibold">Default Exam Settings</h2>
     <p className="text-sm text-muted-foreground">These values pre-fill when starting an exam from this bundle.</p>

     <div className="space-y-2">
       <Label>Default questions</Label>
       <Input type="number" min={1} value={examQuestionCount} onChange={(e) => setExamQuestionCount(parseInt(e.target.value) || 5)} />
     </div>

     <div className="space-y-2">
       <Label>Default time limit (minutes, 0 = no limit)</Label>
       <Input type="number" min={0} value={examTimeLimitMinutes} onChange={(e) => setExamTimeLimitMinutes(parseInt(e.target.value) || 0)} />
     </div>

     <div className="space-y-2">
       <Label>Points per correct answer</Label>
       <Input type="number" min={0} step={0.5} value={examPointsPerCorrect} onChange={(e) => setExamPointsPerCorrect(parseFloat(e.target.value) || 1)} />
     </div>

     <div className="space-y-2">
       <Label>Negative points per wrong answer</Label>
       <Input type="number" max={0} step={0.25} value={examPointsPerWrong} onChange={(e) => setExamPointsPerWrong(parseFloat(e.target.value) || 0)} />
     </div>

     <div className="space-y-2">
       <Label>Focus on weak cards: {examDifficultyFilter}%</Label>
       <Slider value={[examDifficultyFilter]} onValueChange={([v]) => setExamDifficultyFilter(v)} min={0} max={100} step={10} />
     </div>
   </div>
   ```
6. Import `Slider` from `@/components/ui/slider`.

**Tests**: Manual — edit a bundle, set exam defaults, save, open exam dialog from the same bundle, verify defaults pre-fill.

**Commit**: `feat(bundle): edit default exam settings on bundle edit page`

---

## Phase 6 — E2E Test Update

### Task 6.1: Update exam E2E test to cover advanced options

**What**: Update the existing `exam-flow.spec.ts` E2E test to verify the new advanced options in the exam dialog, and add a new test for point-based scoring.

**Files**: `e2e/exam-flow.spec.ts`

**Implementation notes**:

1. In the existing test, after clicking "Take Exam", verify the Collapsible "Advanced Options" trigger is visible:
   ```ts
   await expect(examDialog.getByText("Advanced Options")).toBeVisible();
   ```

2. Add a new test case for point-based scoring:
   ```ts
   test("create exam with custom points and verify weighted score", async ({ page }) => {
     // ... setup: create cards, bundle, add cards ...

     // Open exam dialog
     // Expand advanced options
     await examDialog.getByText("Advanced Options").click();

     // Set points per correct to 1, points per wrong to -0.25
     // Verify these inputs exist and are editable

     // Start exam, answer some correctly, some incorrectly
     // Verify results show point breakdown
   });
   ```

3. Add a test for the Input+Slider sync on questions and time:
   ```ts
   test("question count and time inputs sync with sliders", async ({ page }) => {
     // ... setup ...
     // Type a number in the question count Input
     // Verify the Slider updates to match
     // Type a number in the time limit Input
     // Verify the Slider updates to match
   });
   ```

4. Add a test for bundle exam setting persistence:
   ```ts
   test("exam settings persist on bundle", async ({ page }) => {
     // ... create bundle with cards ...
     // Open exam dialog, set custom points and time
     // Start and immediately cancel (or complete) the exam
     // Open exam dialog again
     // Verify the settings pre-fill from the bundle
   });
   ```

**Tests**: Run `pnpm exec playwright test e2e/exam-flow.spec.ts` and verify all tests pass.

**Commit**: `test(e2e): add tests for exam advanced options and point-based scoring`

---

## Phase 7 — Documentation

### Task 7.1: Update user docs for exam advanced options

**What**: Add documentation in `docs/` for the new exam features.

**Files**: `docs/exam-advanced-options.md` (new)

**Implementation notes**:
Create a markdown file covering:
- How to configure exam settings (points, time, difficulty) in the exam dialog.
- How the scoring formula works (points earned = correct × pointsPerCorrect + wrong × pointsPerWrong; score = earned / maxPossible).
- How default exam settings are saved per-bundle and pre-fill on next use.
- How to edit default exam settings on the bundle edit page.

**Commit**: `docs: add exam advanced options documentation`

### Task 7.2: Update README if needed

**What**: Ensure README stays slim per conventions. No changes needed unless the project description should mention exam features.

**Files**: none (likely no changes)

**Commit**: (skip if no changes needed)

---

## Execution Checklist

- [x] License question: user said "don't care" — skipping, LICENSE already exists.
- [x] Docker/CI question: user said "don't care" — skipping.
- [x] Research phase completed — all code locations and API signatures verified from source.
- [x] Every library reference traces to source code in the project (Drizzle ORM, shadcn/ui, Remix Icon).
- [x] Every task has a `**Tests**` subsection (except pure scaffolding Task 0.1).
- [x] E2E testing phase exists (Phase 6) with concrete scenarios.
- [x] Every task ends with a `**Commit**` line.
- [x] README is slim — no changes needed.
- [x] All docs and images are under `docs/`.
- [x] `pnpm dlx` or `pnpm exec` used instead of `npx`.
- [x] No skills installation needed (all components are shadcn-ui additions).