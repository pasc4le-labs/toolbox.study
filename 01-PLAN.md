# 01 — StudyToolbox Plan

> A client-side study app with two sections: **Study Dome** (FSRS-spaced flashcards, bundles, tags, exams) and **AI Factory** (AI-generated cards via BYOK). Built with Next.js App Router, Drizzle + sql.js, shadcn/ui, and ts-fsrs.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.
- All data is client-side (Drizzle + sql.js persisted to IndexedDB). No server database.
- Every interactive page is a `'use client'` component (the DB only exists in the browser).
- Use `pnpm dlx shadcn@latest add <component>` for shadcn components. Icon library is `remixicon` (`@remixicon/react`).
- Use `pnpm add <pkg>` for npm dependencies.
- After any schema change: `pnpm db:migrate` (runs `drizzle-kit generate` + export script).
- Next.js App Router: sections are route-group pages (`/study-dome/…`, `/ai-factory/…`).

## Research Summary

| Area | Details |
|------|---------|
| **Framework** | Next.js 16.2.6 App Router. RSC enabled but all DB pages are `'use client'`. |
| **DB** | Drizzle ORM + sql.js (SQLite in-browser). Persisted to IndexedDB via `src/db/storage.ts`. Migrations exported to JSON via `scripts/export-migrations.ts`. Command: `pnpm db:migrate`. |
| **UI** | shadcn/ui v4 (radix-mira style, Tailwind v4, remixicon icons). Existing: `button`. Components to add: `card`, `dialog`, `badge`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `slider`, `progress`, `tabs`, `separator`, `tooltip`, `scroll-area`, `sheet`, `sonner`, `empty`. |
| **FSRS** | `ts-fsrs` v5.4.1. Key API: `import { createEmptyCard, fsrs, Rating, State, type Card, type FSRSParameters } from 'ts-fsrs'`. `scheduler.repeat(card, now)` → previews all 4 ratings. `scheduler.next(card, now, Rating.Good)` → `{ card, log }`. Card fields: `difficulty`, `due`, `elapsed_days`, `lapses`, `last_review`, `learning_steps`, `reps`, `scheduled_days`, `stability`, `state`. |
| **AI SDK** | Vercel AI SDK `ai` v6.0.191. BYOK via `import { createOpenAICompatible } from '@ai-sdk/openai-compatible'`. `import { generateText } from 'ai'`. Provider config: `{ name, apiKey, baseURL }`. |
| **Existing schema** | `cards` (id, front, back, explanation, createdAt), `card_tags` (card_id, tag PK), `bundles` (id, title, createdAt), `bundle_cards` (card_id, bundle_id PK), `todos` (legacy, keep). |
| **License** | EUPL-1.2 (present in repo root). |
| **Deploy** | Vercel — no Docker, no CI. |
| **Doc URLs** | ts-fsrs: https://github.com/open-spaced-repetition/ts-fsrs · AI SDK: https://sdk.vercel.ai · shadcn: https://ui.shadcn.com |

---

## Phase 0 — Project Bootstrap

### Task 0.1: License ✅
- Already present as `LICENSE` (EUPL-1.2). No action needed.

### Task 0.2: Install core dependencies
**What**: Install `ts-fsrs` for spaced repetition, `ai` + `@ai-sdk/openai-compatible` for AI generation, and `sonner` for toast notifications.
**Commands**:
```bash
pnpm add ts-fsrs ai @ai-sdk/openai-compatible sonner
```
**Commit**: `chore: install ts-fsrs, ai sdk, sonner`

### Task 0.3: Add shadcn components
**What**: Add required shadcn/ui components. Run each separately to avoid conflicts.
**Commands**:
```bash
pnpm dlx shadcn@latest add card dialog badge input textarea select checkbox radio-group slider progress tabs separator tooltip scroll-area sheet sonner empty
```
**Commit**: `chore: add shadcn ui components`

---

## Phase 1 — Schema Redesign & Data Layer

### Task 1.1: Redesign database schema
**What**: Replace the current simplified schema with the full StudyToolbox schema. The cards table gains a `type` column and type-specific JSON fields. New tables for FSRS state, review logs, exams, and exam attempts. Tag-level FSRS tracking via aggregated queries over card FSRS data.

**Files**: `src/db/schema.ts`

**Schema design**:

```typescript
// ── Card Types ──
// 'multi_radio' | 'multi_select' | 'open' | 'knowledge'

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['multi_radio', 'multi_select', 'open', 'knowledge'] }).notNull(),
  front: text('front').notNull(),        // question / prompt
  back: text('back').notNull(),          // answer / response
  explanation: text('explanation'),      // optional explanation
  options: text('options'),              // JSON: string[] for multi_radio / multi_select. null for open/knowledge.
  correctIndices: text('correct_indices'), // JSON: number[] — indices of correct options. null for open/knowledge.
  createdAt: integer('created_at').notNull().default(Date.now()),
  updatedAt: integer('updated_at').notNull().default(Date.now()),
});

// Tag table (normalized)
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

// Card ↔ Tags (many-to-many)
export const cardTags = sqliteTable('card_tags', {
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.cardId, table.tagId] }),
]);

// Bundles
export const bundles = sqliteTable('bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

// Bundle ↔ Cards (many-to-many, preserves order)
export const bundleCards = sqliteTable('bundle_cards', {
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  bundleId: integer('bundle_id').notNull().references(() => bundles.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.cardId, table.bundleId] }),
]);

// FSRS card state (1:1 with cards)
export const cardFsrs = sqliteTable('card_fsrs', {
  cardId: integer('card_id').primaryKey().references(() => cards.id, { onDelete: 'cascade' }),
  difficulty: real('difficulty').notNull().default(0),
  stability: real('stability').notNull().default(0),
  state: integer('state').notNull().default(0),  // State.New=0, Learning=1, Review=2, Relearning=3
  due: integer('due').notNull().default(Date.now()),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  lastReview: integer('last_review'),
  learningSteps: integer('learning_steps').notNull().default(0),
});

// Review logs
export const reviewLogs = sqliteTable('review_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),  // Rating.Again=1, Hard=2, Good=3, Easy=4
  state: integer('state').notNull(),
  due: integer('due').notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  elapsedDays: integer('elapsed_days').notNull(),
  lastElapsedDays: integer('last_elapsed_days').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  review: integer('review').notNull(),  // timestamp
  learningSteps: integer('learning_steps').notNull().default(0),
});

// Exams
export const exams = sqliteTable('exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  bundleId: integer('bundle_id').references(() => bundles.id, { onDelete: 'cascade' }),
  questionCount: integer('question_count').notNull(),
  timeLimitSeconds: integer('time_limit_seconds'),    // null = no timer
  difficultyFilter: real('difficulty_filter'),          // 0-1 slider: % of low-scoring cards to include. null = random.
  createdAt: integer('created_at').notNull().default(Date.now()),
});

// Exam attempts (tracks a single session of taking an exam)
export const examAttempts = sqliteTable('exam_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  examId: integer('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  score: real('score'),  // 0-1, computed at completion
});

// Exam attempt answers (one per card in the exam)
export const examAnswers = sqliteTable('exam_answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attemptId: integer('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  // For multi_radio: the chosen index; multi_select: JSON number[]; open: null (not auto-graded)
  answer: text('answer'),
  isCorrect: integer('is_correct', { mode: 'boolean' }),
});

// AI Provider configs (stored in localStorage/client-side DB for BYOK)
export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),          // e.g. "OpenAI", "Ollama"
  baseUrl: text('base_url').notNull(),     // e.g. "https://api.openai.com/v1"
  apiKey: text('api_key'),
  modelId: text('model_id').notNull(),     // e.g. "gpt-4o-mini"
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

// Keep legacy todos
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});
```

**Type exports**: Infer select/insert types for every table.

**Relations**: cards → cardTags, bundleCards, cardFsrs; tags → cardTags; bundles → bundleCards, exams; exams → examAttempts; examAttempts → examAnswers; aiProviders (standalone).

**Implementation notes**:
- Use `real` for `difficulty`, `stability`, `difficultyFilter`, `score` — SQLite stores them as 8-byte IEEE 754 float.
- `options` and `correctIndices` stored as JSON strings; parse at application layer.
- `answer` in `examAnswers` is a JSON string for multi_select, a plain number string for multi_radio, or null for open.
- Tag FSRS "score" is computed at query time by aggregating `cardFsrs.stability`/`cardFsrs.state` for all cards with a given tag — no dedicated table needed.

**Tests**: Unit tests for schema creation + migration (verify all tables create without error).

**Commit**: `feat(db): redesign schema for cards, exams, FSRS, AI providers`

### Task 1.2: Generate and export migration
**What**: Run drizzle-kit generate, then export to JSON.
**Commands**:
```bash
pnpm db:migrate
```
Verify `src/db/migrations/export.json` contains the new migration with all `CREATE TABLE` statements.

**Commit**: `chore(db): generate migration for new schema`

### Task 1.3: Create DB helper functions
**What**: Write typed query helper functions that wrap Drizzle operations for common tasks. These are the data-access layer used by UI components.

**Files**: `src/lib/db-queries.ts`

**Exports**:
- `getOrCreateCardFsrs(db, cardId)` — returns existing FSRS row or creates one from `createEmptyCard()`
- `rateCard(db, cardId, rating: Rating)` — uses ts-fsrs `scheduler.next()`, updates `cardFsrs`, inserts `reviewLogs`
- `getCardsByTag(db, tagId)` — joins cards ↔ cardTags ↔ tags
- `getCardsByBundle(db, bundleId)` — joins cards ↔ bundleCards, ordered by `bundleCards.order`
- `getDueCards(db, tagId?, bundleId?)` — queries cards where `cardFsrs.due <= now` with optional tag/bundle filters
- `getTagStats(db)` — aggregates per-tag FSRS metrics (avg stability, % new/learning/review, count)
- `createExam(db, title, bundleId, questionCount, timeLimitSeconds, difficultyFilter?)` — inserts exam
- `startExamAttempt(db, examId)` — inserts examAttempt, selects cards based on exam config
- `submitExamAnswer(db, attemptId, cardId, order, answer, isCorrect)` — inserts examAnswer
- `completeExamAttempt(db, attemptId)` — sets `completedAt`, computes `score`
- `getExamResults(db, attemptId)` — returns attempt + all answers with card data
- `generateAndInsertCards(db, providerId, content, count)` — AI generation (Task 3.x)
- All CRUD for cards, bundles, tags, AI providers

**Implementation notes**:
- All functions take `db: SQLJsDatabase<typeof schema>` as first param (the Drizzle instance from `getDb()`).
- Use `import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard } from 'ts-fsrs'` for FSRS logic.
- `rateCard`: call `scheduler.next(existingFsrsState, new Date(), rating)` then update `cardFsrs` and insert `reviewLogs`.
- For tag FSRS aggregation: `SELECT tag_id, AVG(stability), COUNT(*), ... FROM card_fsrs JOIN card_tags GROUP BY tag_id`. Use Drizzle's `sql` for aggregation.

**Tests**: Unit tests for `rateCard`, `getDueCards`, `getTagStats`, exam flow (create → start → answer → complete).

**Commit**: `feat(db): add typed query helpers for cards, FSRS, exams`

---

## Phase 2 — Homepage & Navigation

### Task 2.1: Homepage with section cards
**What**: Replace the current minimal homepage with a card-based layout showing the two sections (Study Dome, AI Factory) as large clickable cards, each with an icon and description. Like app launchers.

**Files**: `src/app/(main)/page.tsx`

**Implementation**:
- Use shadcn `Card` composition (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`).
- Two cards side by side (grid on desktop, stacked on mobile):
  1. **Study Dome** — icon: `RiBookOpenLine`, link to `/study-dome`, description: "Review cards, take exams, track your progress with spaced repetition."
  2. **AI Factory** — icon: `RiMagicLine`, link to `/ai-factory`, description: "Generate flashcards from content using AI."
- Each card links to its respective route.
- Keep the existing `Boxed` layout component.

**Tests**: Visual — verify cards render and link correctly.

**Commit**: `feat(home): add section cards for Study Dome and AI Factory`

### Task 2.2: Route group pages and layouts
**What**: Create the route group structure for Study Dome and AI Factory as separate pages.

**Files**:
- `src/app/(main)/study-dome/page.tsx` — Study Dome landing (list bundles + quick actions)
- `src/app/(main)/study-dome/layout.tsx` — Study Dome shared layout (sub-navigation)
- `src/app/(main)/ai-factory/page.tsx` — AI Factory landing (providers list + generate)
- `src/app/(main)/ai-factory/layout.tsx` — AI Factory shared layout

**Implementation**:
- Both layouts wrap children with a sub-header (section title + breadcrumb) using `Boxed`.
- Study Dome landing: shows bundles as cards, a "Create Bundle" button, and a "Tags" link.
- AI Factory landing: shows configured AI providers, an "Add Provider" button, and a "Generate Cards" button.

**Commit**: `feat(routes): add study-dome and ai-factory route groups`

---

## Phase 3 — Card Management UI

### Task 3.1: Card creation form
**What**: A `'use client'` page/modal to create and edit a flashcard. Supports all 4 card types.

**Files**: `src/app/(main)/study-dome/cards/new/page.tsx`, `src/app/(main)/study-dome/cards/[id]/edit/page.tsx`

**Implementation**:
- `type` selector: `RadioGroup` with 4 options (multi_radio, multi_select, open, knowledge).
- When `multi_radio` or `multi_select`:
  - Dynamic list of option inputs (`Input`) with add/remove buttons.
  - For `multi_radio`: `RadioGroup` to select the correct answer(s) — single correct index → `correctIndices: JSON.stringify([selectedIndex])`.
  - For `multi_select`: `Checkbox` group for correct answers → `correctIndices: JSON.stringify(sortedCheckedIndices)`.
- When `open` or `knowledge`: no options, no correct indices.
- `front` (required): `Textarea` for question/prompt.
- `back` (required): `Textarea` for answer.
- `explanation` (optional): `Textarea`.
- Tags: a `Select` combinator or inline tag input. Use existing `tags` table; allow creating new tags inline.
- Bundle assignment: `Checkbox` group of existing bundles, or skip.
- When type changes, clear options/correctIndices fields.
- On submit: insert into `cards`, `cardTags`, `bundleCards`.

**Tests**: Form renders, type switching shows/hides options, submit creates card with correct JSON fields.

**Commit**: `feat(study-dome): add card creation and edit forms`

### Task 3.2: Card list and detail view
**What**: Pages to list cards and view card details.

**Files**: `src/app/(main)/study-dome/cards/page.tsx`, `src/app/(main)/study-dome/cards/[id]/page.tsx`

**Implementation**:
- Card list page: fetch all cards, display in a grid/table with type badge, front preview, tags. Filter by tag, bundle, type. Search by front text.
- Card detail page: shows front, back, explanation, type badge, options with correct highlighting, tags, bundles, FSRS stats (stability, difficulty, state, next due date). Edit/Delete buttons.
- Use shadcn `Badge` for card type and tags. Use `Card` for layout.

**Commit**: `feat(study-dome): add card list and detail views`

### Task 3.3: Bundle management
**What**: Create, list, and edit bundles. Add/remove cards from bundles.

**Files**: `src/app/(main)/study-dome/bundles/page.tsx`, `src/app/(main)/study-dome/bundles/new/page.tsx`, `src/app/(main)/study-dome/bundles/[id]/page.tsx`, `src/app/(main)/study-dome/bundles/[id]/edit/page.tsx`

**Implementation**:
- Bundle list: cards showing title, card count, description.
- Bundle detail: ordered list of cards in the bundle. Drag-to-reorder (simplified: up/down buttons updating `bundleCards.order`). Shows tag summary for the bundle.
- Add cards to bundle: `Select` or searchable multi-select from existing cards.
- Remove cards from bundle: button per card.
- Create bundle: title + description.

**Commit**: `feat(study-dome): add bundle management pages`

### Task 3.4: Tag management
**What**: Dedicated tag page showing per-tag FSRS stats and quick access to tag-filtered review.

**Files**: `src/app/(main)/study-dome/tags/page.tsx`, `src/app/(main)/study-dome/tags/[id]/page.tsx`

**Implementation**:
- Tag list page: shows all tags with card count, average stability, % of cards in each FSRS state. Uses `getTagStats()` from db-queries.
- Tag detail page: lists all cards with this tag, their FSRS state, with a "Review these cards" button that links to `/study-dome/review?tagId=X`.

**Commit**: `feat(study-dome): add tag management with FSRS stats`

---

## Phase 4 — FSRS Review Mode

### Task 4.1: Review session page and logic
**What**: A `'use client'` page where users review due cards one at a time, rating them via FSRS (Again/Hard/Good/Easy).

**Files**: `src/app/(main)/study-dome/review/page.tsx`

**Implementation**:
- Accepts optional query params: `?bundleId=X` or `?tagId=X` or no filter (all due cards).
- Loads due cards using `getDueCards(db, tagId?, bundleId?)`.
- Shows one card at a time:
  - Front is visible initially.
  - User clicks "Show Answer" to flip and reveal back + explanation.
  - After revealing, show 4 rating buttons: Again, Hard, Good, Easy (with icons and colors).
- On rating: call `rateCard(db, cardId, rating)`, then advance to next card.
- Progress indicator: "Card N of M".
- If no due cards: show empty state with `Empty` component — "No cards due for review!"
- Card display adapts to type:
  - `knowledge`: just front/back, no options shown.
  - `multi_radio`: show options as radio buttons, let user select, then compare.
  - `multi_select`: show options as checkboxes, let user select, then compare.
  - `open`: show front, user types free response in textarea, then reveals back for self-comparison.

**Tests**: Review flow — loads due cards, shows front, reveals back, records rating, advances.

**Commit**: `feat(study-dome): add FSRS review session page`

### Task 4.2: Review results summary
**What**: After reviewing all due cards, show a summary of the session.

**Files**: Same page, conditional rendering after all cards reviewed.

**Implementation**:
- Show number of cards reviewed, average rating, and time spent.
- Per-card breakdown: front, rating given, new stability/due date.
- "Back to Study Dome" button.

**Commit**: `feat(study-dome): add review session summary`

---

## Phase 5 — Exam Mode

### Task 5.1: Exam creation modal
**What**: A dialog to configure and create a new exam from a bundle.

**Files**: `src/app/(main)/study-dome/bundles/[id]/page.tsx` (integrated as dialog)

**Implementation**:
- Trigger: "Take Exam" button on bundle detail page.
- Modal (shadcn `Dialog`) with:
  - Title field (prefilled with bundle title + " Exam").
  - `Slider` for number of questions (1 to bundle card count).
  - `Slider` for time limit (0 = no limit, 5/10/15/30/60 minutes).
  - `Slider` for difficulty filter (0% = random selection, 100% = prioritize lowest-stability cards). Label: "Focus on weak cards".
  - "Start Exam" button.
- On create: `createExam()` + `startExamAttempt()` in the db.
- Redirect to `/study-dome/exams/[attemptId]`.

**Commit**: `feat(study-dome): add exam creation modal with difficulty slider`

### Task 5.2: Exam-taking UI (exam mode)
**What**: The exam-taking interface with a fixed sidebar and question navigation.

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/page.tsx`

**Implementation**:
- Full-width layout with exam content on the left and a right sidebar:
  - **Right sidebar**: exam title, numbered question buttons (grid), timer (if time limit set), "Submit Exam" button.
  - **Main area**: current question card displayed according to type.
- Question card rendering:
  - `multi_radio`: render options as `RadioGroup`, user selects one.
  - `multi_select`: render options as `Checkbox` group, user selects multiple.
  - `open`: render `Textarea` for free response.
  - `knowledge`: excluded from exams (skip during card selection). If a bundle only has knowledge cards, show a warning.
- Numbered buttons in sidebar:
  - Unanswered: default style.
  - Answered: primary/highlighted style.
  - Current: ring/focus style.
- Timer: count-down from `timeLimitSeconds`. On expiry: auto-submit.
- On answer change: `upsertExamAnswer()` in local state; save to DB on navigation or on submit.
- "Submit Exam" button: calls `completeExamAttempt()`.

**Tests**: Navigating between questions, answering, timer expiration, submission.

**Commit**: `feat(study-dome): add exam-taking UI with sidebar navigation`

### Task 5.3: Exam results page
**What**: After submitting an exam, show results with scoring for objective question types.

**Files**: `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`

**Implementation**:
- Fetch `getExamResults(db, attemptId)`.
- Show overall score (percentage), number correct, total questions, time taken.
- Per-question breakdown:
  - For `multi_radio`: shows user's choice vs correct answer, highlighted in green/red.
  - For `multi_select`: shows user's selections vs correct indices, partial credit allowed.
  - For `open`: shows "Not auto-graded" badge. User's answer displayed alongside the correct answer for self-review.
- "Back to Bundle" and "Review Cards" buttons.

**Commit**: `feat(study-dome): add exam results page with scoring`

---

## Phase 6 — AI Factory

### Task 6.1: AI Provider management
**What**: Create/manage BYOK AI provider configurations. Stored in the local DB.

**Files**: `src/app/(main)/ai-factory/page.tsx`, `src/components/ai-provider-form.tsx`

**Implementation**:
- AI Factory landing page lists configured providers (cards with name, model, base URL).
- "Add Provider" button opens a `Dialog` with:
  - Name (`Input`)
  - Base URL (`Input`, e.g. `https://api.openai.com/v1`)
  - API Key (`Input` type=password, with show/hide toggle)
  - Model ID (`Input`, e.g. `gpt-4o-mini`)
  - "Set as default" `Checkbox`
- Save to `aiProviders` table via Drizzle.
- Edit/delete existing providers.
- Provider validation: on save, try a simple `generateText` call to verify connectivity. Use `@ai-sdk/openai-compatible`:
  ```typescript
  import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
  import { generateText } from 'ai';

  const provider = createOpenAICompatible({
    name: provider.name,
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
  });
  const { text } = await generateText({
    model: provider.chatModel(provider.modelId),
    prompt: 'Say "connected" if you can read this.',
    maxOutputTokens: 10,
  });
  ```

**Tests**: Provider CRUD, validation call succeeds/fails gracefully.

**Commit**: `feat(ai-factory): add AI provider management`

### Task 6.2: Card generation from content
**What**: A page where users paste content, select a provider, and generate flashcards.

**Files**: `src/app/(main)/ai-factory/generate/page.tsx`

**Implementation**:
- Form with:
  - `Textarea` for source content (pasted text).
  - `Select` for AI provider (from `aiProviders` table).
  - `Select` for card type to generate (`multi_radio`, `multi_select`, `open`, `knowledge`).
  - `Input` (number) for number of cards to generate (1-20).
  - Optional: `Input` for target tags (comma-separated).
  - Optional: `Select` for target bundle (or "Create new bundle").
- On submit:
  1. Build a prompt that instructs the AI to generate N cards of the given type from the content. Prompt should request structured JSON output.
  2. Call `generateText` with the selected provider:
     ```typescript
     const provider = createOpenAICompatible({
       name: storedProvider.name,
       apiKey: storedProvider.apiKey,
       baseURL: storedProvider.baseUrl,
     });
     const { text } = await generateText({
       model: provider.chatModel(storedProvider.modelId),
       prompt: systemPrompt + userContent,
     });
     ```
  3. Parse the AI response as JSON array of cards (`{ type, front, back, explanation, options?, correctIndices? }`).
  4. Insert each card into the DB, associate with tags and bundle.
- Show loading state during generation.
- Show results: list of generated cards with edit/delete options.
- On error: show toast via `sonner`.

**System prompt template**:
```
You are a flashcard generator. Generate {count} {type} flashcards from the following content.
Each card must be a JSON object with these fields:
- front: string (the question or prompt)
- back: string (the answer or response)
- explanation: string or null (optional explanation)
{typeSpecificFields}

Return a JSON array of card objects. No markdown, no explanation, just the JSON array.
```

For `multi_radio` / `multi_select`, the prompt also requests `options: string[]` and `correctIndices: number[]`.

**Tests**: Generation flow, JSON parsing, DB insertion, error handling.

**Commit**: `feat(ai-factory): add card generation from content`

---

## Phase 7 — Polish & UX

### Task 7.1: Refine navigation and breadcrumbs
**What**: Add consistent sub-navigation within Study Dome and AI Factory using breadcrumbs and section tabs.

**Files**: Update layouts from Task 2.2

**Implementation**:
- Study Dome layout: horizontal `Tabs` or `NavigationMenu` with: Overview, Cards, Bundles, Tags.
- AI Factory layout: horizontal tabs with: Providers, Generate.
- Use `Breadcrumb` for page-level navigation (e.g., Study Dome > Bundles > My Bundle).
- Update `Navbar` to include section links (Study Dome, AI Factory).

**Commit**: `feat(ui): add section navigation and breadcrumbs`

### Task 7.2: Empty states and loading
**What**: Add proper empty states and loading skeletons throughout the app.

**Files**: All page components

**Implementation**:
- Every list page uses `Empty` component when no items exist, with a CTA button.
- Every data fetch shows `Skeleton` loading states.
- Use `sonner` `toast()` for success/error notifications on mutations.
- Add a `Toaster` component to the root layout:
  ```tsx
  import { Toaster } from "sonner";
  // in layout
  <Toaster />
  ```

**Commit**: `feat(ui): add empty states, loading skeletons, and toasts`

### Task 7.3: Responsive design pass
**What**: Ensure all pages work well on mobile (exam sidebar collapses, card grids stack, forms are usable).

**Files**: All page components

**Implementation**:
- Exam mode: sidebar moves to bottom sheet (`Sheet` component) on mobile, shows as right sidebar on desktop. Use `md:` breakpoint.
- Card grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Modals: full-screen on mobile, centered dialog on desktop.
- Touch targets: minimum 44px for all interactive elements.

**Commit**: `feat(ui): responsive design pass for mobile`

---

## Phase 8 — E2E Testing

### Task 8.1: E2E test setup
**What**: Set up Playwright for end-to-end testing in a client-side DB app.

**Files**: `playwright.config.ts`, `e2e/setup.ts`

**Implementation**:
```bash
pnpm add -D @playwright/test
```
- Configure Playwright for Next.js.
- Setup: before each test, clear IndexedDB to start fresh.
- Since DB is client-side, tests run against the running dev server.

**Commit**: `test: add Playwright E2E test harness`

### Task 8.2: E2E scenario — Card CRUD
**What**: Test creating, viewing, editing, and deleting a card.

**Steps**:
1. Navigate to Study Dome > Cards > New.
2. Fill in card type (multi_radio), front, back, options.
3. Submit and verify card appears in list.
4. Click card, verify details.
5. Edit card, verify changes.
6. Delete card, verify it's gone.

**Commit**: `test: add E2E scenario for card CRUD`

### Task 8.3: E2E scenario — Exam flow
**What**: Test creating a bundle, creating an exam, taking it, and reviewing results.

**Steps**:
1. Create a bundle with 5 multi_radio cards.
2. Open bundle detail, click "Take Exam".
3. Configure exam (3 questions, no timer, 50% difficulty).
4. Navigate through questions, answer each.
5. Submit exam.
6. Verify results page shows score.

**Commit**: `test: add E2E scenario for exam flow`

---

## Phase 9 — Documentation

### Task 9.1: User docs
**What**: Write user-facing documentation.

**Files**: `docs/usage.md`, `docs/study-dome.md`, `docs/ai-factory.md`, `docs/fsrs.md`

**Content**:
- `usage.md`: Installation, getting started, data storage (client-side, persists across sessions).
- `study-dome.md`: Card types, bundles, tags, review mode, exam mode.
- `ai-factory.md`: BYOK setup, supported providers, generation tips.
- `fsrs.md`: Brief explanation of FSRS algorithm, rating meanings, how tag FSRS works.

**Commit**: `docs: add user documentation`

### Task 9.2: Technical docs
**What**: Write developer-facing documentation.

**Files**: `docs/architecture.md`, `docs/schema.md`

**Content**:
- `architecture.md`: Next.js App Router structure, client-side DB pattern, key modules.
- `schema.md`: Full database schema with ER diagram (textual), column descriptions.

**Commit**: `docs: add technical documentation`

### Task 9.3: Final README polish
**What**: Ensure README is slim per the template.

**Files**: `README.md`

**Content**: Project name, one-line description, install, dev, license. Link to `docs/`.

**Commit**: `docs: polish README`

---

## Execution Checklist

- [x] License present (EUPL-1.2)
- [x] Docker/CI: not included (Vercel deploy)
- [x] Research completed with real tool output
- [x] Every library reference traces to Context7/Brave source
- [x] Every task has a Tests subsection (where applicable)
- [x] E2E testing phase exists with concrete scenarios
- [x] Every task ends with a Commit line
- [x] README is slim per template
- [x] All docs and images are under `docs/`
- [x] `pnpm` used exclusively (not `npx`)
- [x] No skills installed (no relevant project-scoped skills found)