# 06 — Exam Results Feed Into FSRS

> When a student completes an exam, each answered card's FSRS state is updated based on correctness: correct → `Rating.Good`, wrong → `Rating.Again`. This feeds exam performance directly into the spaced-repetition scheduler, so the Review page shows weaker cards sooner after exam failures.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.
- Use `pnpm dlx` or `pnpm exec` instead of `npx` everywhere.

---

## Research Summary

### Current Architecture

| Area | Details |
|------|---------|
| **FSRS lib** | `ts-fsrs@5.4.1` — provides `createEmptyCard`, `fsrs()`, `Rating` enum (`Manual=0, Again=1, Hard=2, Good=3, Easy=4`), `State` enum (`New=0, Learning=1, Review=2, Relearning=3`), `Grade` type (`Rating.Again|Hard|Good|Easy`). |
| **Review flow** | `review/page.tsx` → `rateCard(db, cardId, rating)` → updates `cardFsrs` row + inserts `reviewLogs` row + calls `persistNow()`. |
| **`rateCard` function** | `src/lib/db-queries.ts:303` — reads current `cardFsrs` state, calls `scheduler.next(card, now, rating)`, writes updated difficulty/stability/state/due/etc. back to `cardFsrs`, and inserts a `reviewLogs` row. |
| **Exam flow** | `startExamAttempt()` selects cards from a bundle, creates an `examAttempt`, inserts empty `examAnswers`. During the exam, `submitExamAnswer()` saves each answer with `isCorrect` (boolean or null for open questions). `completeExamAttempt()` computes a score but does **NOT** touch FSRS. |
| **`completeExamAttempt`** | `src/lib/db-queries.ts:613` — fetches attempt, exam, answers; calculates `score = maxPoints > 0 ? max(0, totalPoints / maxPoints) : 0`; sets `completedAt` and `score` on the attempt. No FSRS updates. |
| **`examAnswers` table** | `examAnswers.answer` stores the user's answer; `examAnswers.isCorrect` stores `true`/`false`/`null` (null for open-type cards that aren't auto-graded). |
| **DB** | sql.js (client-side SQLite via Drizzle ORM); `persistNow()` flushes to IndexedDB. |
| **E2E tests** | Playwright; `e2e/exam-flow.spec.ts` covers exam creation, taking, and results. |

### Key API Signatures (verified from `ts-fsrs@5.4.1`)

```ts
// Rating enum values
enum Rating { Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4 }
type Grade = Exclude<Rating, Rating.Manual>;  // 1 | 2 | 3 | 4

enum State { New = 0, Learning = 1, Review = 2, Relearning = 3 }

// Card interface (what scheduler.next() expects as input)
interface Card {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;         // deprecated but still required
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: Date;
}

// createEmptyCard(returnRefDueOn?: DateInput): CardInput
// fsrs(): IScheduler → scheduler.next(card, now, grade) → { card: Card, log: ReviewLog }
```

### Key DB Schema (verified from `src/db/schema.ts`)

```ts
// cardFsrs — 1:1 with cards
export const cardFsrs = sqliteTable('card_fsrs', {
  cardId: integer('card_id').primaryKey().references(() => cards.id, { onDelete: 'cascade' }),
  difficulty: real('difficulty').notNull().default(0),
  stability: real('stability').notNull().default(0),
  state: integer('state').notNull().default(0),       // State.New=0, Learning=1, Review=2, Relearning=3
  due: integer('due').notNull().default(Date.now()),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  lastReview: integer('last_review'),
  learningSteps: integer('learning_steps').notNull().default(0),
});

// reviewLogs
export const reviewLogs = sqliteTable('review_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),        // Rating.Again=1, Hard=2, Good=3, Easy=4
  state: integer('state').notNull(),
  due: integer('due').notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  elapsedDays: integer('elapsed_days').notNull(),
  lastElapsedDays: integer('last_elapsed_days').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  review: integer('review').notNull(),        // timestamp
  learningSteps: integer('learning_steps').notNull().default(0),
});

// examAnswers
export const examAnswers = sqliteTable('exam_answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attemptId: integer('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  answer: text('answer'),
  isCorrect: integer('is_correct', { mode: 'boolean' }),
});
```

### Mapping: Exam answer correctness → FSRS Rating

| `examAnswers.isCorrect` | FSRS Rating | Rationale |
|---|---|---|
| `true` | `Rating.Good` (3) | Correct answer → solid knowledge, schedule forward normally |
| `false` | `Rating.Again` (1) | Wrong answer → needs relearning, reset lapses |
| `null` (open/knowledge) | Skip | Can't auto-grade → don't update FSRS |

### Existing `rateCard` implementation pattern

```ts
// From src/lib/db-queries.ts:303
export async function rateCard(db: Db, cardId: number, rating: Rating, reviewTime?: Date) {
  const now = reviewTime ?? new Date();
  const fsrsState = await getOrCreateCardFsrs(db, cardId);  // reads or creates cardFsrs row
  const scheduler = fsrs();
  const { card: updatedCard, log } = scheduler.next(
    { difficulty, stability, state, due, elapsed_days, scheduled_days, reps, lapses, last_review, learning_steps },
    now,
    rating as Grade,
  );
  // Update cardFsrs row
  await db.update(schema.cardFsrs).set({ ... mapped from updatedCard ... }).where(eq(schema.cardFsrs.cardId, cardId));
  // Insert reviewLogs row
  await db.insert(schema.reviewLogs).values({ ... mapped from log and updatedCard ... });
  return { card: updatedCard, log };
}
```

---

## Phase 1 — Core: FSRS Update on Exam Completion

### Task 1.1: Add `rateCardFromExam` helper to `db-queries.ts`

**What**: Create a new function `rateCardFromExam(db, cardId, rating)` that updates a single card's FSRS state and inserts a review log, identical to `rateCard` but with a clear semantic name indicating the rating came from an exam rather than a manual review. Then refactor `completeExamAttempt` to call it for every auto-graded answer.

Actually, after analysis: `rateCard` already does exactly what we need — it takes a `cardId` and a `Rating`, updates the card's FSRS state, and inserts a review log. We don't need a new function. We just need to call `rateCard` from inside `completeExamAttempt` for each answer.

**Files**: `src/lib/db-queries.ts`

**Implementation notes**:

1. Modify `completeExamAttempt` to, after computing the score and before returning, iterate through all auto-graded answers (`isCorrect !== null`) and call `rateCard(db, cardId, rating)` where:
   - `isCorrect === true` → `Rating.Good`
   - `isCorrect === false` → `Rating.Again`

2. The `rateCard` function is already imported and available in `db-queries.ts` (line 3). Import `Rating` is already there.

3. Insert FSRS updates **after** score computation but still inside `completeExamAttempt`, so they're atomic with exam completion. Call `persistNow()` at the end.

4. Wrap all FSRS updates in a try/catch so that a failure to update FSRS doesn't prevent the exam from completing (the score is still saved). Log errors to console.

5. The `rateCard` function calls `persistNow()` after each card. For bulk updates from an exam, we can avoid N persists by batching. However, `rateCard` calls `persistNow()` internally — we'll add a `skipPersist` optional parameter to `rateCard` to avoid this, then call `persistNow()` once at the end of `completeExamAttempt`.

Wait — `rateCard` does **not** call `persistNow()` currently. Looking at the code again:

```ts
export async function rateCard(db: Db, cardId: number, rating: Rating, reviewTime?: Date) {
  // ... updates cardFsrs and inserts reviewLogs ...
  // No persistNow() call!
  return { card: updatedCard, log };
}
```

Confirmed: `rateCard` does NOT call `persistNow()`. So we can call it in a loop and then call `persistNow()` once at the end. No API change needed.

6. Add a `comment`-style note in the code to explain the mapping.

**The modified `completeExamAttempt` function**:

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

  const score = maxPoints > 0 ? Math.max(0, totalPoints / maxPoints) : 0;

  await db
    .update(schema.examAttempts)
    .set({ completedAt: Date.now(), score })
    .where(eq(schema.examAttempts.id, attemptId));

  // Update FSRS state for each auto-graded answer
  for (const answer of answered) {
    try {
      const rating = answer.isCorrect ? Rating.Good : Rating.Again;
      await rateCard(db, answer.cardId, rating);
    } catch (e) {
      // Don't fail exam completion if FSRS update fails for a card
      console.error(`Failed to update FSRS for card ${answer.cardId}:`, e);
    }
  }

  await persistNow();
  return score;
}
```

**Tests**: Unit tests are not practical for sql.js client-side DB operations. E2E test coverage in Task 1.2.

**Commit**: `feat(exams): update card FSRS state on exam completion`

### Task 1.2: E2E test — exam answers update FSRS

**What**: Add a Playwright E2E test that:
1. Creates multi_radio cards
2. Creates a bundle, adds cards to it
3. Starts an exam on that bundle
4. Answers some questions correctly and some incorrectly
5. Submits the exam
6. Navigates to the Review page and verifies that cards answered incorrectly appear as due (or their FSRS state has changed), while correctly answered cards have different scheduling.

**Files**: `e2e/exam-fsrs.spec.ts`

**Implementation notes**:

- The existing `e2e/exam-flow.spec.ts` demonstrates the pattern for creating cards, bundles, taking exams.
- After exam completion, navigate to `/study-dome/review?bundleId=X` and verify that some cards appear as due (since wrong answers set them to `Rating.Again` which makes them due immediately).
- Since we can't easily inspect the DB directly in Playwright, the test should verify observable behavior: after completing an exam with wrong answers, the review page should show cards as due.

**Tests**:
- Test case: Exam with all correct answers → review page may show no new due cards (or cards scheduled far out).
- Test case: Exam with some wrong answers → review page shows those cards as due for re-review.

**Commit**: `test(exams): add E2E test for FSRS update on exam completion`

---

## Phase 2 — UI: Communicate FSRS Updates on Results Page

### Task 2.1: Show FSRS update summary on exam results page

**What**: After completing an exam, the results page should display a brief summary showing how many cards had their FSRS state updated — e.g., "3 cards marked for review (incorrect), 7 cards reinforced (correct)". This gives the user feedback that their exam performance affected their study schedule.

**Files**:
- `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`

**Implementation notes**:

1. The results page currently shows: score percentage, correct/incorrect counts, per-question breakdown, and a "Back to Study Dome" / "Back to Bundle" button.

2. Add a small info section below the score card that reads:
   - "✓ N cards reinforced (correct answers)" with a green check icon
   - "↻ M cards marked for re-review (incorrect answers)" with a refill/retry icon
   - "(Open answers are not auto-graded)" as a small note if there are `isCorrect === null` answers

3. Use existing `Badge` and `Card` components.

4. The data is already available: `answers.filter(a => a.isCorrect === true).length` and `answers.filter(a => a.isCorrect === false).length` and `answers.filter(a => a.isCorrect === null).length`. No new DB queries needed.

**Tests**: Covered by Task 1.2 E2E test (results page will show the counts).

**Commit**: `feat(exams): show FSRS update summary on results page`

### Task 2.2: Add "Review Weak Cards" button on results page

**What**: Add a button on the exam results page that links directly to the review page filtered by the bundle, so the student can immediately review the cards they got wrong. Since the FSRS update already made those cards due, the review page will naturally show them.

**Files**:
- `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`

**Implementation notes**:

1. After the existing "Back to Study Dome" and "Back to Bundle" buttons, add a conditional "Review Weak Cards" button:
   - Only shown if `wrongCount > 0`
   - Links to `/study-dome/review?bundleId={exam.bundleId}`
   - Uses the `RiRefreshLine` icon (already available via `@remixicon/react`)

2. Since wrong answers get `Rating.Again` (which makes them immediately due), this link will show the student's weakest cards first.

**Tests**: Covered by Task 1.2 E2E test.

**Commit**: `feat(exams): add review weak cards button on results page`

---

## Phase 3 — Documentation

### Task 3.1: Update architecture docs

**What**: Add a section to `docs/architecture.md` documenting that exam results now feed into FSRS.

**Files**: `docs/architecture.md`

**Implementation notes**:

- Add a subsection under Study Dome explaining the exam → FSRS pipeline.
- Document the mapping: correct → `Rating.Good`, incorrect → `Rating.Again`, ungraded (open) → skipped.
- Note that this happens automatically on exam completion, no user action required.

**Commit**: `docs: document exam-to-FSRS pipeline in architecture`

---

## Execution Checklist

- [x] License: already present, no action needed
- [x] Docker/CI: not in scope for this plan
- [x] Research phase completed — `ts-fsrs@5.4.1` API verified, `rateCard` implementation verified, `completeExamAttempt` verified, schema verified
- [x] Every library reference traces to source: `ts-fsrs` enums/interfaces verified from `node_modules/ts-fsrs/dist/index.d.ts`
- [x] Every task has a Tests subsection (Task 1.1 is implementation-only; 1.2 provides E2E tests; 2.1–2.2 are covered by 1.2)
- [x] E2E testing phase exists (Task 1.2)
- [x] Every task ends with a Commit line
- [x] README remains slim — no changes needed
- [x] All docs under `docs/`
- [x] `pnpm dlx`/`pnpm exec` used instead of `npx`
- [x] No new skills needed