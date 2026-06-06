# 04 — StudyToolbox Testing Plan

> Add comprehensive unit and E2E tests for all `lib/**` and `lib/services/**` modules, plus major user-facing functionalities.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Test runner** | Vitest — modern, Vite-native, Jest-compatible API. Config: `vitest.config.ts` with `@/` path alias. |
| **DB layer** | sql.js (WASM SQLite) + Drizzle ORM. In-memory DB for tests via `initSqlJs()` + `drizzle()`. Schema in `src/db/schema.ts`. Migrations applied via `(_db.dialect as any).migrate(migrations, _db.session, ...)`. |
| **FSRS** | `ts-fsrs` library: `createEmptyCard()`, `fsrs()`, `Rating.Again/Hard/Good/Easy`, `scheduler.next(card, now, rating)`. |
| **E2E** | Playwright already configured in `e2e/playwright.config.ts`. Tests run against `localhost:3000` dev server. Helper `clearIndexedDB(page)` resets DB via `window.__nukeDb()`. |
| **AI SDK** | `ai` package with `generateObject` / `generateText`. `ai-tagger.ts` calls external APIs — must be mocked in unit tests. |
| **Vitest DB helper** | Create in-memory sql.js DB, run migrations, return `{ db, sqlDb }`. Mock `persistNow()` to no-op. Each test gets a fresh DB via `beforeEach`. |
| **Key imports** | `import { drizzle } from "drizzle-orm/sql-js"`, `import initSqlJs from "sql.js"`, `import { createEmptyCard, fsrs, Rating } from "ts-fsrs"`, `import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"` |
| **DB type** | `type Db = SQLJsDatabase<typeof schema>` from `src/lib/services/types.ts` |
| **Existing E2E** | 6 specs: `card-crud`, `exam-flow`, `exchange`, `bundle-stats`, `exam-fsrs`, `import-export` |

---

## Phase 0 — Test Infrastructure

### Task 0.1: Install Vitest and configure test runner
**What**: Add Vitest as a dev dependency and create the configuration file. Enable path alias `@/` → `./src/`. Add test script to `package.json`.
**Files**: `vitest.config.ts`, `package.json`
**API reference**: Vitest `defineConfig` from `vitest/config` — verified via Context7 `/vitest-dev/vitest`.
**Implementation notes**:
- `pnpm add -D vitest`
- Create `vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config'
  import path from 'path'

  export default defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  })
  ```
- Add script to `package.json`: `"test": "vitest", "test:run": "vitest run", "test:coverage": "vitest run --coverage"`
- The `copy-wasm.mjs` script copies sql.js WASM to `public/` for the browser. For Node.js tests, sql.js needs to locate its WASM file differently. The `postinstall` script handles this for the build, but Vitest runs in Node.js and needs `initSqlJs` to find the WASM. Use the bundled WASM from `node_modules/sql.js/dist/sql-wasm.wasm`.
**Tests**: Run `pnpm test:run` with a placeholder test file to verify the setup works.
**Commit**: `chore(test): add vitest configuration`

### Task 0.2: Create test database helper
**What**: Create a utility that initializes an in-memory sql.js database with Drizzle ORM and applies migrations. This is the foundation for all DB-dependent service tests.
**Files**: `src/__tests__/helpers/test-db.ts`
**API reference**: `import initSqlJs from "sql.js"` — returns `SqlJsStatic`. `import { drizzle } from "drizzle-orm/sql-js"`. Migration import from `src/db/migrations/export.json`.
**Implementation notes**:
- The helper must:
  1. Call `initSqlJs()` to get the `SqlJsStatic` constructor (for WASM path, use `locateFile: (file) => require.resolve('sql.js/dist/' + file)` or point to `node_modules/sql.js/dist/sql-wasm.wasm`)
  2. Create a new in-memory `Database`: `new sqlJs.Database()`
  3. Wrap with Drizzle: `drizzle(db, { schema })`
  4. Apply migrations using the same approach as `src/db/index.ts`: `(_db.dialect as any).migrate(migrations, (_db as any).session, { migrationsTable: '__drizzle_migrations' })`
  5. Return `{ db: Db, sqlDb: Database }`
- Create a `createTestDb()` async function that returns a fresh DB each call
- Create a `destroyTestDb(sqlDb: Database)` function that calls `sqlDb.close()`
- Export `createTestDb` and `destroyTestDb`
- Mock `persistNow` from `@/db` as a no-op in tests. Since `persistNow()` is imported by service files, we need `vi.mock('@/db', () => ({ persistNow: vi.fn() }))` in service test files.
**Tests**: Write `src/__tests__/helpers/test-db.test.ts` to verify `createTestDb()` returns a working `Db` instance, and that a simple insert/select round-trip works.
**Commit**: `test: add test database helper for in-memory sql.js`

### Task 0.3: Create seed data factory helpers
**What**: Create factory functions that insert test records into the DB, returning the created records. These avoid boilerplate in every test.
**Files**: `src/__tests__/helpers/factories.ts`
**Implementation notes**:
- Factory functions that use the actual service functions (no mocking) to create records:
  ```ts
  import { createCard } from '@/lib/services/card'
  import { createTag, getOrCreateTag } from '@/lib/services/tag'
  import { createBundle } from '@/lib/services/bundle'
  import { createExam } from '@/lib/services/exam'
  import { createAiProvider } from '@/lib/services/ai-provider'
  import type { Db } from '@/lib/services/types'

  export async function seedCard(db: Db, overrides?: Partial<{type, front, back, explanation, options, correctIndices, tagIds, bundleIds}>) { ... }
  export async function seedTag(db: Db, name?: string) { ... }
  export async function seedBundle(db: Db, title?: string) { ... }
  export async function seedExam(db: Db, bundleId: number, overrides?: ...) { ... }
  export async function seedAiProvider(db: Db, overrides?: ...) { ... }
  ```
- Default values for each factory so tests can call `seedCard(db)` and get a valid card
- `seedCard` defaults: `type = 'knowledge'`, `front = 'Test question'`, `back = 'Test answer'`
- `seedTag` defaults: `name = 'test-tag'`
- `seedBundle` defaults: `title = 'Test Bundle'`
- `seedExam` defaults: `title = 'Test Exam'`, `questionCount = 5`, `pointsPerCorrect = 1`, `pointsPerWrong = 0`
**Tests**: Verify each factory creates a record and returns it (part of service tests below).
**Commit**: `test: add seed data factory helpers`

---

## Phase 1 — Pure Logic Unit Tests (no DB dependency)

### Task 1.1: Test `src/lib/utils.ts` — `cn()` utility
**What**: Test the `cn()` function that merges clsx class names with tailwind-merge.
**Files**: `src/lib/__tests__/utils.test.ts`
**Implementation notes**:
- Import `cn` from `@/lib/utils`
- Test cases:
  - Merges simple class names: `cn('foo', 'bar')` → `'foo bar'`
  - Handles conditional classes: `cn('foo', false && 'bar', 'baz')` → `'foo baz'`
  - Merges conflicting Tailwind classes: `cn('px-2', 'px-4')` → `'px-4'`
  - Handles undefined/null inputs: `cn(undefined, null, 'foo')` → `'foo'`
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for cn utility`

### Task 1.2: Test `src/lib/sqt-parser.ts` — SQT parser
**What**: Test the `parseSqt()` function that parses SQT-formatted text files into structured card data.
**Files**: `src/lib/__tests__/sqt-parser.test.ts`
**Implementation notes**:
- Import `parseSqt`, `SqtCard`, `SqtParseResult` from `@/lib/sqt-parser`
- Test cases:
  - Parse a single exercise with all fields (question, options A-C, Risposta, Commento)
  - Parse multiple exercises in one text
  - Handle `\r\n` and `\r` line endings (normalization)
  - Parse exercise with D) option (4 options)
  - Return error for exercise with empty question text
  - Return error for exercise with no options
  - Return error for exercise with Risposta letter out of range
  - Return error for exercise missing Risposta line
  - Handle exercise without Commento (no explanation)
  - Parse `Esercizio` case-insensitively (`/^Esercizio\s+\d+\s*\./i`)
  - Handle extra whitespace in option text
  - Verify `correctIndices` maps A→0, B→1, C→2, D→3
  - Verify `back` field is the text of the correct option (not the letter)
  - Verify `tags` is always empty `[]`
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for SQT parser`

### Task 1.3: Test `src/lib/exchange-protocol.ts` — Exchange message types and chunking
**What**: Test the protocol type definitions and the `chunkPayload` / `reassembleChunks` functions.
**Files**: `src/lib/__tests__/exchange-protocol.test.ts`
**Implementation notes**:
- Import `chunkPayload`, `reassembleChunks`, `CHUNK_SIZE`, and all type guards from `@/lib/exchange-protocol`
- Test cases:
  - `chunkPayload` splits a string shorter than `CHUNK_SIZE` into one chunk
  - `chunkPayload` splits a string exactly equal to `CHUNK_SIZE` into one chunk
  - `chunkPayload` splits a string longer than `CHUNK_SIZE` into multiple chunks, last chunk shorter
  - `reassembleChunks` reconstructs the original string from chunks
  - Round-trip: `reassembleChunks(chunkPayload(payload))` === `payload` for various payload sizes (empty string, small, exactly CHUNK_SIZE, 2x CHUNK_SIZE, non-round multiple)
  - `CHUNK_SIZE` equals `16 * 1024`
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for exchange protocol types and chunking`

### Task 1.4: Test `src/lib/exchange-chunk.ts` — Transfer message creation
**What**: Test `createTransferMessages` which wraps payload into `TransferStart` + `TransferChunk[]` + `TransferComplete` sequence.
**Files**: `src/lib/__tests__/exchange-chunk.test.ts`
**Implementation notes**:
- Import `createTransferMessages`, `chunkPayload`, `reassembleChunks` from `@/lib/exchange-chunk`
- Test cases:
  - `createTransferMessages` for empty string: returns `[TransferStart(1), TransferChunk(0, ''), TransferComplete]`
  - `createTransferMessages` for short string: first message is `TransferStart`, last is `TransferComplete`, middle are `TransferChunk` with correct indices
  - Total chunks count matches `TransferStart.totalChunks`
  - Each `TransferChunk.index` is sequential (0, 1, 2, ...)
  - `TransferComplete` has no data
  - Reassembling all `TransferChunk.data` fields yields original payload
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for exchange chunk transfer messages`

### Task 1.5: Test `src/lib/ai-tagger.ts` — `normalizeTagName` and `buildBatchPrompt`
**What**: Test the pure functions `normalizeTagName` and `buildBatchPrompt` from the AI tagger module. Mock the AI SDK calls for `tagCardsWithAI`.
**Files**: `src/lib/__tests__/ai-tagger.test.ts`
**Implementation notes**:
- `normalizeTagName` is not exported — it's a private function. Since it's file-scoped, we have two options:
  1. Export it for testing by adding `export` to the function signature
  2. Test it indirectly through `tagCardsWithAI` with mocked AI calls
- Approach: Add `export` keyword to `normalizeTagName` in `ai-tagger.ts` and `buildBatchPrompt` so they can be unit tested directly, then test them.
- Test cases for `normalizeTagName`:
  - Trims whitespace: `"  hello  "` → `"hello"`
  - Lowercases: `"Biology"` → `"biology"`
  - Replaces spaces with hyphens: `"cell structure"` → `"cell-structure"`
  - Removes non-alphanumeric (except hyphens): `"bio@#logy!"` → `"biology"`
  - Collapses multiple hyphens: `"a---b"` → `"a-b"`
  - Removes leading/trailing hyphens: `"-hello-"` → `"hello"`
  - Returns empty string for input that normalizes to nothing: `"@@@"` → `""`
- Test cases for `buildBatchPrompt`:
  - Includes card front and back text (truncated to 500 chars)
  - Includes existing tag names when provided
  - Includes "No existing tags" message when tag list is empty
  - Prompt contains JSON structure instructions
- Test `tagCardsWithAI` with mocked `generateObject`/`generateText`:
  - When cards array is empty, returns empty array immediately (no AI call)
  - When `abortSignal.aborted` is true, throws `DOMException` with name `"AbortError"`
  - Mock `generateObject` to return structured assignments → verify results are normalized via `normalizeTagName`
  - Mock `generateObject` to throw → falls back to `generateText` → verify JSON parsing fallback works
  - Mock both to fail → returns empty array (graceful degradation)
  - Verify batching: if 30 cards with batchSize=15, two batches are processed
  - Verify progress callback is called with phase, current, total, and message
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for AI tagger normalizeTagName, buildBatchPrompt, and tagCardsWithAI with mocking`

---

## Phase 2 — Service Unit Tests (DB-dependent)

### Task 2.1: Test `src/lib/services/card.ts` — Card CRUD and queries
**What**: Test all card service functions: create, update, delete, get by ID, get all, search, get untagged by bundle, get by tag, get by bundle, get card tags, add tags to card, get card bundles.
**Files**: `src/lib/services/__tests__/card.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))`
- Use `createTestDb()` in `beforeEach`, `destroyTestDb()` in `afterEach`
- Test cases:
  - `createCard(db, { type: 'knowledge', front: 'Q1', back: 'A1' })` — creates card with correct fields, returns card with id, also creates FSRS entry
  - `createCard(db, { type: 'multi_radio', front: 'Q2', back: 'A2', options: ['A', 'B'], correctIndices: [0], tagIds: [tagId] })` — creates card with options, correctIndices, and tags
  - `createCard(db, { type: 'knowledge', front: 'Q3', back: 'A3', bundleIds: [bundleId] })` — creates card and links to bundle
  - `getCardById(db, id)` — returns card when exists, `null` when not found
  - `getAllCards(db)` — returns all cards ordered by `createdAt`
  - `updateCard(db, id, { front: 'Updated Q' })` — updates specified fields, sets `updatedAt`
  - `updateCard(db, id, { tagIds: [newTagId] })` — replaces card's tags
  - `updateCard(db, id, { bundleIds: [newBundleId] })` — replaces card's bundles
  - `deleteCard(db, id)` — removes card, verify `getCardById` returns `null`
  - `searchCards(db, 'question')` — returns cards matching LIKE query on `front`
  - `getUntaggedCardsByBundle(db, bundleId)` — returns cards in bundle without any tags
  - `getCardsByTag(db, tagId)` — returns cards with specified tag
  - `getCardsByBundle(db, bundleId)` — returns cards in bundle ordered by `order`
  - `getCardTags(db, cardId)` — returns tags for card
  - `getCardBundles(db, cardId)` — returns bundles containing the card
  - `addTagsToCard(db, cardId, [tagId])` — adds tags without removing existing ones
**Tests**: As described above.
**Commit**: `test(services): add unit tests for card service`

### Task 2.2: Test `src/lib/services/tag.ts` — Tag CRUD and stats
**What**: Test all tag service functions: create, getOrCreate, getAll, delete, and getTagStats.
**Files**: `src/lib/services/__tests__/tag.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))`
- Test cases:
  - `createTag(db, 'biology')` — creates tag, returns it with id
  - `createTag(db, 'biology')` twice — second call fails (unique constraint)
  - `getOrCreateTag(db, 'biology')` — creates on first call, returns existing on second call
  - `getOrCreateTag(db, 'Biology')` — creates a different tag (case-sensitive by default)
  - `getAllTags(db)` — returns tags ordered by name
  - `deleteTag(db, id)` — removes tag, `getAllTags` no longer includes it
  - `getTagStats(db)` — returns aggregated stats with cardCount, avgStability, state breakdowns (requires cards with FSRS data to be meaningful)
  - `getTagStats(db)` with no tags — returns empty array
**Tests**: As described above.
**Commit**: `test(services): add unit tests for tag service`

### Task 2.3: Test `src/lib/services/bundle.ts` — Bundle CRUD and analytics
**What**: Test all bundle service functions: create, update, delete, getAll, getById, addCards, removeCard, reorder, getBundleExamStats, getBundlePastAttempts, getBundleCardWeakness.
**Files**: `src/lib/services/__tests__/bundle.test.ts`
**Implementation notes**:
- Mock `@/db` module
- Test cases:
  - `createBundle(db, { title: 'Test Bundle' })` — creates bundle, returns with id
  - `createBundle(db, { title: 'Test Bundle', description: 'desc' })` — creates with description
  - `updateBundle(db, id, { title: 'Updated' })` — updates fields
  - `updateBundle(db, id, { examQuestionCount: 10, examTimeLimitSeconds: 300 })` — updates exam settings
  - `deleteBundle(db, id)` — removes bundle
  - `getAllBundles(db)` — returns all bundles ordered by title
  - `getBundleById(db, id)` — returns bundle or `null`
  - `addCardsToBundle(db, bundleId, [card1Id, card2Id])` — adds cards with correct ordering
  - `addCardsToBundle(db, bundleId, [card3Id])` — appends after existing cards
  - `removeCardFromBundle(db, bundleId, cardId)` — removes card from bundle
  - `reorderBundleCard(db, bundleId, cardId, newOrder)` — updates card order
  - `getBundleExamStats(db, bundleId)` with no exams — returns zero stats
  - `getBundleExamStats(db, bundleId)` with exams and attempts — returns correct totals, avgScore, bestScore, worstScore, totalTimeSeconds
  - `getBundlePastAttempts(db, bundleId)` — returns attempts ordered by startedAt DESC
  - `getBundleCardWeakness(db, bundleId)` — returns cards sorted by incorrectRate DESC, only cards with at least one answer
  - `getBundleCardWeakness(db, bundleId)` with no answers — returns empty array
**Tests**: As described above.
**Commit**: `test(services): add unit tests for bundle service`

### Task 2.4: Test `src/lib/services/ai-provider.ts` — AI provider CRUD
**What**: Test all AI provider service functions: create, update, delete, getAll, getDefault.
**Files**: `src/lib/services/__tests__/ai-provider.test.ts`
**Implementation notes**:
- Mock `@/db` module (note: `persistNow` is not called in ai-provider, but `createAiProvider` does not use `persistNow` — verify)
- Actually, looking at the code, `ai-provider.ts` does NOT call `persistNow()` after mutations. This is a potential bug (DB won't persist), but we test the service as-is.
- Test cases:
  - `createAiProvider(db, { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini' })` — creates provider with defaults (`providerType: 'openai-compatible'`, `isDefault: false`)
  - `createAiProvider(db, { ..., isDefault: true })` — sets `isDefault: true` and unsets any previous default
  - `updateAiProvider(db, id, { apiKey: 'new-key' })` — updates fields
  - `updateAiProvider(db, id, { isDefault: true })` — unsets other defaults, sets this one
  - `deleteAiProvider(db, id)` — removes provider
  - `getAllAiProviders(db)` — returns providers ordered by `createdAt`
  - `getDefaultAiProvider(db)` — returns the default provider or `null`
**Tests**: As described above.
**Commit**: `test(services): add unit tests for AI provider service`

### Task 2.5: Test `src/lib/services/fsrs.ts` — FSRS state and scheduling
**What**: Test `getOrCreateCardFsrs`, `rateCard`, and `getDueCards`.
**Files**: `src/lib/services/__tests__/fsrs.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))`
- Test cases:
  - `getOrCreateCardFsrs(db, cardId)` — creates a new FSRS entry for a card that doesn't have one, returns existing FSRS entry for a card that already has one
  - `getOrCreateCardFsrs` — verifies initial FSRS values: `state = 0` (New), `reps = 0`, `lapses = 0`, `difficulty > 0`, `stability > 0`
  - `rateCard(db, cardId, Rating.Good)` — updates FSRS state: `reps` increments, `state` changes from New to Learning/Review, `due` moves forward, a review log is inserted
  - `rateCard(db, cardId, Rating.Again)` — increases `lapses`, sets state to Relearning or New
  - `rateCard(db, cardId, Rating.Easy)` — sets high `stability` and long `scheduledDays`
  - `rateCard(db, cardId, Rating.Hard)` — intermediate scheduling
  - `rateCard(db, cardId, rating, reviewTime)` — respects custom reviewTime parameter
  - `getDueCards(db)` — returns cards where `due <= now`
  - `getDueCards(db, { tagId })` — filters by tag
  - `getDueCards(db, { bundleId })` — filters by bundle
  - `getDueCards(db)` — returns empty array when no cards are due
**Tests**: As described above.
**Commit**: `test(services): add unit tests for FSRS service`

### Task 2.6: Test `src/lib/services/exam.ts` — Exam lifecycle
**What**: Test the full exam lifecycle: create exam, start attempt, submit answers, complete attempt, get results.
**Files**: `src/lib/services/__tests__/exam.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))`
- Also mock `@/lib/services/fsrs` or let it use real DB — since `completeExamAttempt` calls `rateCard`, we let it use real FSRS logic
- Test cases:
  - `createExam(db, { title, bundleId, questionCount })` — creates exam with defaults
  - `createExam(db, { ..., timeLimitSeconds: 300, difficultyFilter: 0.5, pointsPerCorrect: 2, pointsPerWrong: -1 })` — creates with custom settings
  - `getExamById(db, id)` — returns exam or `null`
  - `getAllExams(db)` — returns exams ordered by `createdAt`
  - `startExamAttempt(db, examId)` — creates attempt, selects questions, returns `{ attempt, exam, questions }`
  - `startExamAttempt` with `difficultyFilter` — prioritizes low-stability cards
  - `startExamAttempt` when not enough eligible cards — selects all available cards
  - `startExamAttempt` filters out `knowledge` type cards
  - `submitExamAnswer(db, { attemptId, cardId, order, answer, isCorrect: true })` — records answer
  - `submitExamAnswer` — upserts: submitting twice for same attempt+card replaces the answer
  - `getExamAnswers(db, attemptId)` — returns answers ordered by `order`
  - `getExamQuestions(db, attemptId)` — returns questions with card data
  - `completeExamAttempt(db, attemptId)` — calculates score, fills unanswered with `isCorrect: null`, updates FSRS state for answered cards
  - `completeExamAttempt` with all correct answers — score = 1.0
  - `completeExamAttempt` with mixed correct/incorrect — score proportional
  - `completeExamAttempt` with negative scoring (`pointsPerWrong < 0`) — score clamped to 0 minimum
  - `getExamResults(db, attemptId)` — returns attempt, exam, and answers with card details
**Tests**: As described above.
**Commit**: `test(services): add unit tests for exam service`

### Task 2.7: Test `src/lib/exchange-import.ts` — Data import
**What**: Test `importExchangeData` — imports cards, bundles, and exams with duplicate detection and ID mapping.
**Files**: `src/lib/__tests__/exchange-import.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))`
- Test cases:
  - Import cards with tags — tags are created via `getOrCreateTag`, cards are created with tagIds
  - Import cards with duplicate front+type — skips duplicate, maps old ID to existing ID
  - Import bundles — creates bundles, maps card IDs, adds cards to bundles
  - Import bundles with exam settings — preserves `examQuestionCount`, `examTimeLimitSeconds`, etc.
  - Import exams — creates exams with bundle references
  - Import exam with bundleId — maps bundle ID correctly
  - Full round-trip: import all three entity types, verify counts
  - Import with empty arrays — returns zeros
  - Import with `options` and `correctIndices` as JSON strings — parses them correctly
  - Import with `null` options/correctIndices — handles null correctly
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for exchange import`

### Task 2.8: Test `src/lib/exchange-serialize.ts` — Data serialization
**What**: Test `buildManifest` and `serializeSelectedItems`.
**Files**: `src/lib/__tests__/exchange-serialize.test.ts`
**Implementation notes**:
- Mock `@/db` module: `vi.mock('@/db', () => ({ persistNow: vi.fn() }))` (not actually used in serialize but DB module is imported via schema)
- Test cases:
  - `buildManifest` with cards — returns manifest items with kind="card", correct displayName (front truncated to 60 chars), and meta with type and hasExplanation
  - `buildManifest` with bundles — returns items with cardCount in meta
  - `buildManifest` with exams — returns items with questionCount and hasTimer in meta
  - `buildManifest` with empty selection — returns empty array
  - `serializeSelectedItems` with cards — returns card data including tagNames
  - `serializeSelectedItems` with bundles — auto-includes bundle's cards in the output cards array
  - `serializeSelectedItems` with bundles — includes bundle card IDs (mapped to new IDs)
  - `serializeSelectedItems` with exams — returns exam data with bundleId mapping
  - `serializeSelectedItems` — options and correctIndices remain as stored (JSON strings)
  - `serializeSelectedItems` with cards that have no tags — returns empty `tagNames: []`
**Tests**: As described above.
**Commit**: `test(lib): add unit tests for exchange serialization`

---

## Phase 3 — Integration Tests (Cross-Service)

### Task 3.1: Integration test — Full card lifecycle with FSRS
**What**: Test creating a card (which also creates FSRS), fetching due cards, rating cards, and verifying FSRS state transitions across the lifecycle.
**Files**: `src/__tests__/integration/card-fsrs-lifecycle.test.ts`
**Implementation notes**:
- Use real DB (no mocks for services, only mock `persistNow`)
- Test cases:
  - Create a card → verify FSRS entry exists with `state = 0` (New)
  - `getDueCards(db)` returns the new card (New cards are due)
  - `rateCard(db, cardId, Rating.Good)` → verify state changes to Learning or Review, `reps = 1`
  - `rateCard(db, cardId, Rating.Again)` → verify `lapses` increases
  - Rate a card multiple times → verify `reps` accumulates correctly
  - Create multiple cards, rate some, `getDueCards` returns only those still due
  - `getDueCards(db, { tagId })` — only returns due cards with that tag
  - `getDueCards(db, { bundleId })` — only returns due cards in that bundle
**Tests**: As described above.
**Commit**: `test(integration): add card-FSRS lifecycle integration test`

### Task 3.2: Integration test — Full exam lifecycle
**What**: Test creating a bundle with cards, creating an exam, starting an attempt, submitting answers, completing the attempt, and verifying results including FSRS updates.
**Files**: `src/__tests__/integration/exam-lifecycle.test.ts`
**Implementation notes**:
- Use real DB (mock `persistNow` only)
- Test cases:
  - Create 3 multi_radio cards → create bundle → add cards to bundle → create exam
  - Start exam attempt → verify questions are selected (up to `questionCount`), knowledge cards excluded
  - Submit answers for some questions → submit others as incorrect
  - Complete exam attempt → verify score calculation (e.g., 2 correct out of 3 = 0.67)
  - Verify FSRS state was updated for each answered card (correct → Rating.Good, incorrect → Rating.Again)
  - Verify unanswered auto-graded questions (multi_radio/multi_select with no answer) are counted as wrong
  - Complete exam with all correct → score = 1.0
  - Complete exam with negative scoring (`pointsPerWrong = -0.5`) → score can be < 0, clamped to 0
  - `getExamResults` → returns attempt, exam, and answers with card details
**Tests**: As described above.
**Commit**: `test(integration): add exam lifecycle integration test`

### Task 3.3: Integration test — Import/Export round-trip
**What**: Create cards, bundles, and exams via services, serialize them, then import into a fresh DB, and verify all data matches.
**Files**: `src/__tests__/integration/import-export-roundtrip.test.ts`
**Implementation notes**:
- Use two DB instances: source DB and destination DB
- Test cases:
  - Create cards with tags in source DB → serialize → import into fresh DB → verify card data, tags, and count
  - Create bundles with cards in source DB → serialize (with bundles selected) → verify auto-include of bundle's cards → import into fresh DB → verify bundle structure and card order
  - Create exams with bundles → serialize → import → verify exam configuration
  - Test duplicate detection: import same data twice → second import detects duplicate cards (same front + type) and skips them
  - Full round-trip: create all entity types in source → serialize all → import all into fresh DB → verify every field matches (except IDs which are remapped)
**Tests**: As described above.
**Commit**: `test(integration): add import/export round-trip integration test`

---

## Phase 4 — E2E Test Expansion

### Task 4.1: E2E test — Tag CRUD and card filtering
**What**: Playwright E2E tests for creating tags, assigning tags to cards, filtering cards by tag, and deleting tags.
**Files**: `e2e/tag-crud.spec.ts`
**Implementation notes**:
- Use existing Playwright setup from `e2e/playwright.config.ts` and `e2e/setup.ts`
- `clearIndexedDB(page)` before each test
- Test cases:
  - Navigate to tags page → create a tag "biology" → verify it appears in the list
  - Create a card with a tag → view card → verify tag is shown
  - Navigate to tag detail page → verify cards associated with the tag are listed
  - Delete a tag → verify it no longer appears in tag list
  - Create two tags → assign both to a card → verify both appear on card detail page
  - Tag page shows card counts per tag
**Tests**: As described above.
**Commit**: `test(e2e): add tag CRUD and card filtering E2E tests`

### Task 4.2: E2E test — Card search
**What**: Playwright E2E tests for searching cards by text.
**Files**: `e2e/card-search.spec.ts`
**Implementation notes**:
- Test cases:
  - Create multiple cards with distinct fronts → search for one term → verify only matching cards appear
  - Search for non-matching term → verify empty or no-results state
  - Clear search → verify all cards appear again
**Tests**: As described above.
**Commit**: `test(e2e): add card search E2E tests`

### Task 4.3: E2E test — Review flow (FSRS scheduling)
**What**: Playwright E2E test for the review page: cards appear, user rates them, and FSRS scheduling works correctly.
**Files**: `e2e/review-flow.spec.ts`
**Implementation notes**:
- Test cases:
  - Create a multi_radio card → add it to a bundle → navigate to review page with bundle filter → rate the card → verify review session updates
  - Create cards, rate some as Good/Again → verify due cards update appropriately
  - Review all cards until none are due → verify "No Cards Due!" message
**Tests**: As described above.
**Commit**: `test(e2e): add review flow E2E tests`

### Task 4.4: E2E test — AI Provider management
**What**: Playwright E2E tests for the AI tagging page: adding/editing AI providers.
**Files**: `e2e/ai-provider.spec.ts`
**Implementation notes**:
- Navigate to factory/tagger page
- Test cases:
  - Add a new AI provider → verify it appears in the provider list
  - Edit an AI provider's name/model → verify changes persist
  - Set a provider as default → verify only one is default
  - Delete a provider → verify it's removed
**Tests**: As described above.
**Commit**: `test(e2e): add AI provider management E2E tests`

### Task 4.5: E2E test — Bundle edit and card management
**What**: Playwright E2E tests for editing bundles, adding/removing cards, and reordering.
**Files**: `e2e/bundle-edit.spec.ts`
**Implementation notes**:
- Test cases:
  - Create a bundle → add cards via the "Add Cards" dialog → verify cards appear in bundle
  - Create a bundle → add cards → remove a card from bundle → verify card is removed
  - Create a bundle → set exam settings (question count, time limit, difficulty filter, points) → verify settings persisted
  - Create two bundles → add same card to both → verify card appears in both bundles
  - Delete a bundle → verify bundle page no longer shows it
**Tests**: As described above.
**Commit**: `test(e2e): add bundle edit E2E tests`

---

## Phase 5 — Test Utilities and CI Integration

### Task 5.1: Add coverage reporting
**What**: Configure Vitest coverage reporting with Istanbul/V8 provider.
**Files**: `vitest.config.ts`, `package.json`
**Implementation notes**:
- Add `@vitest/coverage-v8` as devDependency: `pnpm add -D @vitest/coverage-v8`
- Update `vitest.config.ts` `test.coverage` config:
  ```ts
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/lib/**', 'src/lib/services/**'],
    exclude: ['src/__tests__/**', 'src/lib/**/types.ts'],
  }
  ```
- Verify: `pnpm test:coverage` produces a coverage summary in the terminal
**Tests**: Run `pnpm test:coverage` and verify it completes with a coverage report.
**Commit**: `chore(test): add coverage reporting configuration`

### Task 5.2: Add test script to package.json and verify all tests pass
**What**: Ensure `pnpm test` runs all unit tests and `pnpm test:e2e` runs E2E tests. Add a combined test script.
**Files**: `package.json`
**Implementation notes**:
- Scripts to add/verify:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "cd e2e && pnpm exec playwright test",
  "test:e2e:headed": "cd e2e && pnpm exec playwright test --headed"
  ```
- Run `pnpm test` to verify all unit tests pass
- Run `pnpm test:e2e` (with dev server running) to verify E2E tests pass
**Tests**: All existing + new tests pass.
**Commit**: `chore(test): add test scripts and verify all tests pass`

---

## Phase 6 — Documentation

### Task 6.1: Write testing documentation
**What**: Create `docs/testing.md` with instructions for running unit tests, E2E tests, coverage, and how to add new tests.
**Files**: `docs/testing.md`
**Implementation notes**:
- Document:
  - How to run unit tests: `pnpm test`
  - How to run tests in watch mode: `pnpm test:watch`
  - How to run with coverage: `pnpm test:coverage`
  - How to run E2E tests: `pnpm test:e2e`
  - How to add a new unit test (use the test-db helper, mock persistNow)
  - How to add a new E2E test (use clearIndexedDB, waitForDb)
  - Test file naming conventions: `*.test.ts` for unit, `*.spec.ts` for E2E
  - Where test helpers live: `src/__tests__/helpers/`
**Commit**: `docs: add testing documentation`

### Task 6.2: Final README polish
**What**: Ensure README links to `docs/` and stays slim. Add a Testing section link.
**Files**: `README.md`
**Implementation notes**:
- Add a line in README under Usage or a new Testing section:
  ```
  ## Testing

  See [docs/testing.md](docs/testing.md) for testing instructions.
  ```
**Commit**: `docs: add testing section to README`