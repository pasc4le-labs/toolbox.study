# 02 — Fix Exam Generation: Random Selection & Persistent Questions

> Fix two bugs: (1) the opposite percentage of "Focus on weak cards" is biased toward strongest cards instead of truly random, and (2) unanswered questions are not saved in past exams because questions are never persisted to the database.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Bug 1: biased random** | In `src/lib/db-queries.ts:476-513`, when `difficultyFilter > 0`, cards are sorted by FSRS stability ascending. `eligible.slice(weakCount)` takes the STRONGEST cards (not random), and the subsequent Fisher-Yates shuffle only randomizes their order — not which cards are selected. Result: the non-weak portion always tests the strongest cards. |
| **Bug 2: questions not persisted** | `startExamAttempt` (`src/lib/db-queries.ts:527-533`) returns `questions` but never inserts them into any DB table. The exam attempt page (`src/app/(main)/study-dome/exams/[attemptId]/page.tsx:84-105`) re-derives questions from bundle order (first N cards in `bundle_cards.order`), ignoring both the random shuffle and the difficulty filter. Unanswered questions have zero DB presence — no `examAnswers` row is created unless the user interacts with the question. |
| **Schema** | `examAttempts` stores `id`, `examId`, `startedAt`, `completedAt`, `score`. `examAnswers` stores `id`, `attemptId`, `cardId`, `order`, `answer`, `isCorrect`. There is no table linking an attempt to its selected questions. |
| **Migration system** | Drizzle ORM with sql.js (client-side SQLite). Migrations generated via `pnpm db:generate` then exported via `pnpm db:export`. Schema in `src/db/schema.ts`, migrations in `src/db/migrations/`, loaded at runtime via `src/db/index.ts`. |
| **Question derivation in attempt page** | `src/app/(main)/study-dome/exams/[attemptId]/page.tsx:84-105` loads all bundle cards, filters out `knowledge` type, and takes first `questionCount` in bundle order. This completely bypasses `startExamAttempt`'s selection logic. |
| **Answer saving** | `saveAnswer` in the attempt page (`line 164`) only fires on user interaction (radio, checkbox, open text). Unanswered/never-visited questions get no `examAnswers` row. |
| **Results rendering** | `getExamResults` (`src/lib/db-queries.ts:661-690`) only fetches cards for which `examAnswers` rows exist. Unanswered questions are invisible. |
| **Completion scoring** | `completeExamAttempt` (`src/lib/db-queries.ts:613-658`) filters answers to `isCorrect !== null` for scoring, completely ignoring unanswered and open-type questions. |

---

## Phase 0 — Schema Migration

### Task 0.1: Add `examQuestions` table to schema

**What**: Add a new `examQuestions` table that persists which cards were selected for each exam attempt, in what order. This is the foundation for both fixes — it enables loading the correct questions (instead of re-deriving from bundle order) and saving unanswered questions.

**Files**: `src/db/schema.ts`

**API reference**: Existing schema patterns — `sqliteTable`, `integer`, `text` from `drizzle-orm/sqlite-core`, `primaryKey` for composite keys.

**Implementation notes**:
- Add the following table definition after `examAnswers` (around line 155):

```ts
export const examQuestions = sqliteTable('exam_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attemptId: integer('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
});

export type ExamQuestion = typeof examQuestions.$inferSelect;
export type NewExamQuestion = typeof examQuestions.$inferInsert;
```

- Add a relation on `examAttemptsRelations`:

```ts
// In examAttemptsRelations, add:
questions: many(examQuestions),
```

- Add a new relation definition:

```ts
export const examQuestionsRelations = relations(examQuestions, ({ one }) => ({
  attempt: one(examAttempts, {
    fields: [examQuestions.attemptId],
    references: [examAttempts.id],
  }),
  card: one(cards, {
    fields: [examQuestions.cardId],
    references: [cards.id],
  }),
}));
```

**Tests**: N/A (schema-only change; migration tested in Task 0.2)
**Commit**: `feat(schema): add exam_questions table`

### Task 0.2: Generate and export the migration

**What**: Run the Drizzle migration generation and export commands to produce a SQL migration file for the new `examQuestions` table.

**Files**: `src/db/migrations/` (generated)

**Implementation notes**:
- Run: `pnpm db:generate` — this generates a new SQL migration file in `src/db/migrations/`
- Run: `pnpm db:export` — this updates `src/db/migrations/export.json` and the snapshots
- Verify the generated SQL creates the `exam_questions` table with columns `id`, `attempt_id`, `card_id`, `order`, and the foreign key constraints.
- The app's `getDb()` function in `src/db/index.ts` automatically applies all pending migrations on startup, so no additional code is needed to run the migration.

**Tests**: Start the dev server (`pnpm dev`) and verify the app loads without errors — the migration runs automatically.
**Commit**: `chore(db): generate migration for exam_questions table`

---

## Phase 1 — Fix: Truly Random Card Selection

### Task 1.1: Fix the random selection algorithm in `startExamAttempt`

**What**: Fix the card selection logic so that the `(1 - difficultyFilter)` portion of questions is selected truly randomly from the remaining eligible cards, not biased toward the strongest cards.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:
- The current code at lines 476-513:
  1. Sorts `eligible` by stability ascending (weakest first)
  2. Takes `weakCards = eligible.slice(0, weakCount)` — correct
  3. Takes `rest = eligible.slice(weakCount)` — BUG: takes all remaining (strongest) cards
  4. Shuffles `rest` — only randomizes ORDER, not SELECTION

- Replace the selection block (lines 495-506) with:

```ts
const weakCount = Math.round(exam.questionCount * exam.difficultyFilter);

// Shuffle a copy of eligible for the random portion
const shuffled = [...eligible];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

// Sort original eligible by stability for weak selection
eligible.sort((a, b) => {
  const aFsrs = fsrsMap.get(a.cards.id);
  const bFsrs = fsrsMap.get(b.cards.id);
  const aStab = aFsrs?.stability ?? 999;
  const bStab = bFsrs?.stability ?? 999;
  return aStab - bStab;
});

const weakCards = eligible.slice(0, weakCount);
const weakCardIds = new Set(weakCards.map((r) => r.cards.id));
const randomPool = shuffled.filter((r) => !weakCardIds.has(r.cards.id));
const randomCards = randomPool.slice(0, exam.questionCount - weakCount);

selected = [...weakCards, ...randomCards];
```

Key difference: The random portion (`randomCards`) is drawn from a shuffled copy of ALL eligible cards, excluding the ones already chosen as weak. This ensures every non-weak card has an equal probability of being selected.

- Also remove the old `rest` variable and its shuffle loop (lines 498-506) since they are replaced by the new logic above.

**Tests**: Write an E2E test (or manual verification) that:
1. Creates a bundle with many cards (e.g., 20+).
2. Creates an exam with `difficultyFilter = 0.5` (50% weak) and `questionCount` less than total cards.
3. Starts multiple exam attempts and inspects which cards are selected. The non-weak cards should vary between attempts (not always the same strongest cards).
4. Verify that when `difficultyFilter = 0` (fully random), selections vary between attempts.

**Commit**: `fix(exams): random card selection is no longer biased toward strongest cards`

---

## Phase 2 — Fix: Persist Questions & Save Unanswered

### Task 2.1: Persist selected questions in `startExamAttempt`

**What**: When starting an exam attempt, insert a row into `examQuestions` for each selected card, so the question list is preserved and not re-derived from bundle order.

**Files**: `src/lib/db-queries.ts`

**API reference**:

```ts
import { examQuestions } from '@/db/schema';
// insert signature:
await db.insert(schema.examQuestions).values(
  selected.map((r, i) => ({
    attemptId: attempt.id,
    cardId: r.cards.id,
    order: i,
  })),
);
```

**Implementation notes**:
- After creating the attempt (line 523) and before the return statement (line 533), insert the selected questions:

```ts
await db.insert(schema.examQuestions).values(
  selected.map((r, i) => ({
    attemptId: attempt.id,
    cardId: r.cards.id,
    order: i,
  })),
);
```

- The return type of `startExamAttempt` already returns `questions: Array<{ card: Card; order: number }>`. This stays the same — we're just also persisting the data.

**Tests**: After starting an exam attempt, verify that `examQuestions` rows exist in the DB with the correct `attemptId`, `cardId`, and `order` values matching the returned questions array.
**Commit**: `feat(exams): persist selected questions when starting an exam attempt`

### Task 2.2: Add `getExamQuestions` query function

**What**: Create a query function that retrieves the persisted questions for an exam attempt, with full card data.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:
- Add after `getExamAnswers` (around line 611):

```ts
export async function getExamQuestions(db: Db, attemptId: number) {
  const questions = await db
    .select({
      id: schema.examQuestions.id,
      attemptId: schema.examQuestions.attemptId,
      cardId: schema.examQuestions.cardId,
      order: schema.examQuestions.order,
      card: schema.cards,
    })
    .from(schema.examQuestions)
    .innerJoin(schema.cards, eq(schema.examQuestions.cardId, schema.cards.id))
    .where(eq(schema.examQuestions.attemptId, attemptId))
    .orderBy(asc(schema.examQuestions.order));

  return questions;
}
```

- This returns an array of `{ id, attemptId, cardId, order, card }` sorted by the original question order.

**Tests**: Call `getExamQuestions` after `startExamAttempt` and verify it returns the same questions in the same order.
**Commit**: `feat(exams): add getExamQuestions query`

### Task 2.3: Replace bundle-derived question loading with persisted questions

**What**: Update the exam attempt page to load questions from `examQuestions` (persisted) instead of re-deriving from bundle order. This ensures the exam shows the same questions that were randomly selected (with difficulty filter), not just the first N bundle cards.

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/page.tsx`

**Implementation notes**:
- Add `getExamQuestions` to imports from `@/lib/db-queries` (line 28-31).
- Replace the bundle-derived question loading block (lines 84-105) with:

```ts
// Load persisted questions for this attempt
const questionRows = await getExamQuestions(db, parseInt(attemptId));

const qs: QuestionData[] = questionRows.map((q) => ({
  cardId: q.card.id,
  front: q.card.front,
  back: q.card.back,
  explanation: q.card.explanation,
  type: q.card.type,
  options: q.card.options,
  correctIndices: q.card.correctIndices,
  order: q.order,
}));
```

- This is simpler and correct — it loads exactly the questions that were randomly selected and persisted when the attempt was created.
- Remove the now-unused `bundleCards` query and the bundle card `filter`/`slice` logic.
- The `getExamById` call (line 76) remains — we still need exam config (title, time limit, etc.).

**Tests**: Start an exam, verify the questions shown match the ones selected by `startExamAttempt`. With `difficultyFilter > 0`, verify that weaker cards appear in the exam (not just the first N bundle cards).
**Commit**: `fix(exams): load questions from persisted exam_questions instead of bundle order`

### Task 2.4: Save unanswered questions on exam completion

**What**: When completing an exam, insert `examAnswers` rows with `answer: null, isCorrect: null` for any questions that were never answered. This ensures unanswered questions appear in the results page.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:
- In `completeExamAttempt` (around line 625, after fetching answers), add logic to find unanswered questions and insert placeholder answer rows:

```ts
// After: const answers = await getExamAnswers(db, attemptId);
const questions = await getExamQuestions(db, attemptId);
const answeredCardIds = new Set(answers.map((a) => a.cardId));
const unanswered = questions.filter((q) => !answeredCardIds.has(q.cardId));

if (unanswered.length > 0) {
  await db.insert(schema.examAnswers).values(
    unanswered.map((q) => ({
      attemptId,
      cardId: q.cardId,
      order: q.order,
      answer: null,
      isCorrect: null,
    })),
  );
}

// Re-fetch answers after inserting placeholders
const allAnswers = await getExamAnswers(db, attemptId);
```

- Replace the subsequent uses of `answers` with `allAnswers` in the scoring logic:
  - `const answered = allAnswers.filter((a) => a.isCorrect !== null);`
  - The `for` loop over `answered` still only processes auto-gradable answers.

- The `return` value and `getExamResults` will now include unanswered questions because all questions have an `examAnswers` row.

**Tests**:
1. Start an exam, answer only some questions, then submit.
2. Verify that ALL questions (answered + unanswered) appear in the results page.
3. Verify that unanswered questions show "(blank)" or "Unanswered" in the results.
4. Verify the score only counts auto-graded answers (not unchanged).

**Commit**: `fix(exams): save unanswered questions as placeholder answers on completion`

### Task 2.5: Update results page to show unanswered questions

**What**: Update the exam results page to display unanswered questions differently from answered ones. Unanswered questions should show as "Unanswered" with no answer data.

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`

**Implementation notes**:
- The results page already handles `isCorrect === null` (for open-type answers, line 189: `<Badge variant="secondary">Not Auto-graded</Badge>`).
- We need to add a distinct display for unanswered questions where `isCorrect === null AND answer === null`. Add a new check:
  - If `a.isCorrect === null && a.answer === null` → show a `<Badge variant="outline">Unanswered</Badge>` instead of "Not Auto-graded".
  - For these questions, the question front text should still show, but the answer section should say "Not answered".

- In the per-question breakdown (lines 173-250), update the badge logic:

```tsx
{a.isCorrect === true ? (
  <Badge className="bg-green-600">Correct</Badge>
) : a.isCorrect === false ? (
  <Badge variant="destructive">Incorrect</Badge>
) : a.answer === null ? (
  <Badge variant="outline">Unanswered</Badge>
) : (
  <Badge variant="secondary">Not Auto-graded</Badge>
)}
```

- For unanswered questions, the options display should show which options were correct (using `parsedCorrect`) but not highlight any user selection:

```tsx
{card.type === "open" && a.answer === null && (
  <div className="space-y-1 text-sm">
    <p><span className="text-muted-foreground">Your answer:</span> <em className="text-muted-foreground">(not answered)</em></p>
    <p><span className="text-muted-foreground">Correct answer:</span> {card.back}</p>
  </div>
)}
```

- Update the summary counting:
  - Add an `unansweredCount` alongside `correctCount`, `wrongCount`, `ungradedCount`.
  - `unansweredCount = answers.filter(a => a.isCorrect === null && a.answer === null).length`
  - Display it in the summary grid if > 0.

**Tests**: Manually verify:
1. Exam with some unanswered questions shows "Unanswered" badge.
2. Exam with open-type answered questions shows "Not Auto-graded" badge (unchanged).
3. Summary shows correct, incorrect, and unanswered counts.
**Commit**: `feat(results): display unanswered questions with distinct badge`

### Task 2.6: Update completion scoring to use `allAnswers` count

**What**: Ensure the `completeExamAttempt` scoring only counts auto-gradable answers, and the score denominator reflects the total number of auto-gradable questions (not including unanswered open-type).

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:
- After Task 2.4, `allAnswers` includes placeholder rows for unanswered questions (where `answer: null, isCorrect: null`).
- The scoring logic filters `answered = allAnswers.filter(a => a.isCorrect !== null)` which correctly excludes both open-type answers and unanswered placeholders.
- However, `maxPoints` should be `answered.length * pointsPerCorrect` — this means unanswered auto-gradable questions (multi_radio, multi_select) should be counted as incorrect. Update the logic:

```ts
const allAnswers = await getExamAnswers(db, attemptId);
// Unanswered auto-gradable questions are treated as incorrect
// (isCorrect === null && answer === null for unanswered)
// Multi-radio/multi-select questions that were never answered have isCorrect = null
// We need to mark them as incorrect for scoring
const gradedAnswers = allAnswers.map((a) => {
  // If a question was never answered but is auto-gradable type, treat as incorrect
  if (a.isCorrect === null && a.answer === null) {
    return { ...a, isCorrect: false };
  }
  return a;
});
const answered = gradedAnswers.filter((a) => a.isCorrect !== null);
const correctCount = answered.filter((a) => a.isCorrect).length;
const wrongCount = answered.filter((a) => a.isCorrect === false).length;
```

- Actually, this is simpler: instead of mutating `isCorrect`, just count unanswered auto-gradable questions as wrong:

```ts
const allAnswers = await getExamAnswers(db, attemptId);
const questions = await getExamQuestions(db, attemptId);
const cardIds = questions.map(q => q.cardId);
const cards = cardIds.length > 0
  ? await db.select().from(schema.cards).where(inArray(schema.cards.id, cardIds))
  : [];
const cardMap = new Map(cards.map(c => [c.id, c]));

// Auto-gradable questions: multi_radio and multi_select
const autoGradableCardIds = new Set(
  cards.filter(c => c.type === 'multi_radio' || c.type === 'multi_select').map(c => c.id)
);

const answered = allAnswers.filter(a => a.isCorrect !== null);
const correctCount = answered.filter(a => a.isCorrect).length;
// Wrong = explicitly wrong + unanswered auto-gradable
const unansweredAutoGradable = allAnswers.filter(
  a => a.isCorrect === null && a.answer === null && autoGradableCardIds.has(a.cardId)
).length;
const wrongCount = answered.filter(a => a.isCorrect === false).length + unansweredAutoGradable;
const totalGraded = correctCount + wrongCount;
const totalPoints = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
const maxPoints = totalGraded * pointsPerCorrect;
const score = maxPoints > 0 ? Math.max(0, totalPoints / maxPoints) : 0;
```

- For FSRS updates: only update cards for explicitly answered questions (where `isCorrect !== null`). Unanswered auto-gradable questions should NOT trigger an FSRS "Again" rating — the user never saw them, so we can't assume they got them wrong at the FSRS level. Only rate cards the user actually attempted.

**Tests**: Create an exam, answer some questions, leave others unanswered. Verify:
1. Unanswered multi_radio/multi_select questions count as incorrect in the score.
2. Unanswered open questions don't affect the score denominator.
3. FSRS is only updated for explicitly answered questions.
**Commit**: `fix(exams): score unanswered auto-gradable questions as incorrect`

---

## Phase 3 — E2E Tests

### Task 3.1: Update existing exam E2E test to verify question persistence

**What**: Update the existing `e2e/exam-flow.spec.ts` to verify that exam questions persist correctly and unanswered questions appear in results.

**Files**: `e2e/exam-flow.spec.ts`

**Implementation notes**:
- The existing test creates 3 cards, starts an exam with defaults, answers 2 of 3 questions, and submits.
- Add assertions after submission to verify:
  1. The results page shows all 3 questions (not just the 2 answered).
  2. The unanswered question shows an "Unanswered" badge.
  3. The answered questions show "Correct" or "Incorrect" badges.
- Add a new test case that verifies `difficultyFilter` produces different question sets across attempts (statistical — run 5 attempts with `difficultyFilter = 0` and verify at least 2 different question orderings appear, assuming enough eligible cards).

**Tests**: This IS the test.
**Commit**: `test(exams): verify question persistence and unanswered display in E2E`

---

## Phase 4 — Polish

### Task 4.1: Clean up `getExamQuestions` fallback for legacy attempts

**What**: Add a fallback in the exam attempt page for attempts that were created before `examQuestions` was introduced (no persisted questions). This prevents crashes on existing in-progress attempts.

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/page.tsx`

**Implementation notes**:
- After loading questions via `getExamQuestions`, if the result is empty (legacy attempt with no persisted questions), fall back to the old bundle-derivation logic:

```ts
let qs: QuestionData[];

const questionRows = await getExamQuestions(db, parseInt(attemptId));

if (questionRows.length > 0) {
  // New path: questions persisted in exam_questions
  qs = questionRows.map((q) => ({
    cardId: q.card.id,
    front: q.card.front,
    back: q.card.back,
    explanation: q.card.explanation,
    type: q.card.type,
    options: q.card.options,
    correctIndices: q.card.correctIndices,
    order: q.order,
  }));
} else {
  // Legacy fallback: derive from bundle order
  const bundleCards = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, e.bundleId))
    .orderBy(schema.bundleCards.order);

  qs = bundleCards
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
}
```

- Similarly in `completeExamAttempt`, if `getExamQuestions` returns empty (legacy), skip inserting unanswered question placeholders.
- Same fallback in `getExamResults` — if no `examQuestions` exist, fall back to current behavior.

**Tests**: Manually verify that an old in-progress exam attempt (without `examQuestions` rows) still loads and completes correctly.
**Commit**: `fix(exams): add fallback for legacy attempts without persisted questions`

---

## Execution Checklist

- [x] License already present in repo
- [x] Docker/CI already set up — no changes needed
- [x] Bug 1 root cause verified in `src/lib/db-queries.ts:496-506` — rest slice biased toward strongest cards
- [x] Bug 2 root cause verified — questions never persisted, exam page re-derives from bundle order
- [x] Every task has a `**Tests**` subsection
- [x] Every task ends with a `**Commit**` line
- [x] All imports, table definitions, and function signatures reference verified code from the existing codebase
- [x] Schema changes follow the existing Drizzle + sql.js migration pattern