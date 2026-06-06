# 03 — Reorganize lib/: Split db-queries into Per-Model Services

> Split the monolithic 1045-line `src/lib/db-queries.ts` into focused per-model service modules under `src/lib/services/`, and create a barrel export for backward compatibility. All consumers update their imports from the old barrel to the new one with no behavioral changes.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

---

## Research Summary

| Area | What was captured |
|------|-------------------|
| Current structure | `src/lib/db-queries.ts` — 1045 lines, all queries for 6 domains: card, tag, bundle, fsrs, exam, ai-provider |
| Shared type | `type Db = SQLJsDatabase<typeof schema>` defined locally in `db-queries.ts`, also duplicated in `exchange-import.ts` |
| Shared import | `persistNow` from `@/db` used in many mutation functions |
| Cross-service dep | `completeExamAttempt` (exam) calls `rateCard` (fsrs) — will become a cross-file import |
| Dead code | `parseJson<T>()` helper at line 11 is defined but never called — drop it |
| Dynamic import | `exchange-import.ts` line 111 does `await import("@/lib/db-queries")` for `updateBundle` — will need path update |
| Consumers | 22 files import from `@/lib/db-queries` — all need import path updates |
| Other lib files | `exchange-import.ts`, `exchange-serialize.ts` use db directly; `exchange-protocol.ts`, `exchange-chunk.ts`, `ai-tagger.ts`, `sqt-parser.ts`, `utils.ts` are untouched |
| Test infra | No unit tests exist; E2E tests in `e2e/` use Playwright — refactoring only needs `pnpm build` + E2E to verify |

### Function-to-Service Mapping

| Service file | Functions |
|---|---|
| `card.ts` | `createCard`, `updateCard`, `deleteCard`, `getCardById`, `getAllCards`, `searchCards`, `getUntaggedCardsByBundle`, `getCardsByTag`, `getCardsByBundle`, `getCardTags`, `getCardBundles`, `addTagsToCard` |
| `tag.ts` | `createTag`, `getOrCreateTag`, `getAllTags`, `deleteTag`, `getTagStats` |
| `bundle.ts` | `createBundle`, `updateBundle`, `deleteBundle`, `getAllBundles`, `getBundleById`, `addCardsToBundle`, `removeCardFromBundle`, `reorderBundleCard`, `getBundleExamStats`, `getBundlePastAttempts`, `getBundleCardWeakness` |
| `fsrs.ts` | `getOrCreateCardFsrs`, `rateCard`, `getDueCards` |
| `exam.ts` | `createExam`, `startExamAttempt`, `getExamById`, `getAllExams`, `submitExamAnswer`, `getExamAnswers`, `getExamQuestions`, `completeExamAttempt`, `getExamResults` |
| `ai-provider.ts` | `createAiProvider`, `updateAiProvider`, `deleteAiProvider`, `getAllAiProviders`, `getDefaultAiProvider` |

### Consumer → New Import Mapping

Each consumer currently imports from `@/lib/db-queries`. After the split, they will import from `@/lib/services` (barrel) or `@/lib/services/<model>` (direct). The barrel re-exports everything so only the path `@/lib/db-queries` → `@/lib/services` needs changing; the named imports stay the same.

| File | Functions imported |
|---|---|
| `src/components/card-form.tsx` | `getAllBundles, getOrCreateTag, getCardTags, getCardBundles, getCardById` → **bundle, tag, card** |
| `src/lib/exchange-import.ts` | `createCard, createBundle, getOrCreateTag` + dynamic `updateBundle` → **card, bundle, tag** |
| `src/app/…/tags/page.tsx` | `getTagStats` → **tag** |
| `src/app/…/tags/[id]/page.tsx` | `getCardsByTag, getCardTags` → **card** |
| `src/app/…/cards/page.tsx` | `getAllCards, searchCards, deleteCard, getCardTags` → **card** |
| `src/app/…/cards/[id]/page.tsx` | `getCardById, deleteCard, getCardTags, getCardBundles` → **card** |
| `src/app/…/review/page.tsx` | `getDueCards, rateCard` → **fsrs** |
| `src/app/…/exams/[attemptId]/page.tsx` | `getExamById, getExamQuestions, submitExamAnswer, completeExamAttempt` → **exam** |
| `src/app/…/exams/[attemptId]/results/page.tsx` | `getExamResults` → **exam** |
| `src/app/…/bundles/page.tsx` | `getAllBundles, deleteBundle` → **bundle** |
| `src/app/…/bundles/new/page.tsx` | `createBundle` → **bundle** |
| `src/app/…/bundles/[id]/page.tsx` | `addCardsToBundle, getAllCards, createExam, startExamAttempt, updateBundle` → **card, exam, bundle** |
| `src/app/…/bundles/[id]/stats/page.tsx` | `getBundleById, getBundleExamStats, getBundleCardWeakness` → **bundle** |
| `src/app/…/bundles/[id]/past-exams/page.tsx` | `getBundleById, getBundlePastAttempts` → **bundle** |
| `src/app/…/bundles/[id]/edit/page.tsx` | `getBundleById, updateBundle` → **bundle** |
| `src/app/…/study-dome/page.tsx` | `getAllBundles` → **bundle** |
| `src/app/…/exchange-center/offer/page.tsx` | `getAllCards, getAllBundles, getAllExams` → **card, bundle, exam** |
| `src/app/…/factory/page.tsx` | `getAllAiProviders, createAiProvider, updateAiProvider, deleteAiProvider` → **ai-provider** |
| `src/app/…/factory/tagger/page.tsx` | `getAllBundles, getAllTags, getUntaggedCardsByBundle, getOrCreateTag, addTagsToCard` → **bundle, tag, card** |
| `src/app/…/factory/generate/page.tsx` | `createCard, getAllTags, getAllBundles, getOrCreateTag, addCardsToBundle` → **card, tag, bundle** |
| `src/app/…/factory/import/page.tsx` | `getAllBundles, createCard, createBundle, getOrCreateTag, addCardsToBundle` → **bundle, card, tag** |
| `src/app/…/factory/export/page.tsx` | `getAllCards, getAllBundles, getCardsByBundle` → **card, bundle** |

---

## Phase 1 — Extract Shared Type & Barrel

### Task 1.1: Create `src/lib/services/types.ts`

**What**: Extract the shared `Db` type alias into its own file so all service modules can import it without circular deps.
**Files**: `src/lib/services/types.ts`
**Implementation notes**:
- Create `src/lib/services/types.ts` with:
  ```ts
  import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
  import * as schema from '@/db/schema';
  export type Db = SQLJsDatabase<typeof schema>;
  ```
- This mirrors the `Db` type currently at line 9 of `db-queries.ts`.

**Commit**: `refactor(lib): extract shared Db type`

### Task 1.2: Create all six service module files

**What**: Create the six per-model service files under `src/lib/services/`, each containing the functions mapped in the Research Summary. Move functions **verbatim** — no logic changes, no renaming.
**Files**:
- `src/lib/services/card.ts`
- `src/lib/services/tag.ts`
- `src/lib/services/bundle.ts`
- `src/lib/services/fsrs.ts`
- `src/lib/services/exam.ts`
- `src/lib/services/ai-provider.ts`

**Implementation notes**:

Each file must:
1. Import `Db` from `./types`.
2. Import `persistNow` from `@/db` (only if the file's functions call it).
3. Import drizzle operators (`eq`, `and`, `inArray`, `sql`, `asc`, `lte`, `isNull`, `or`) only the ones actually used by functions in that file.
4. Import schema from `@/db/schema` and `ts-fsrs` types only if needed.
5. Copy-paste the exact function signatures and bodies from `db-queries.ts`.
6. **Do not** copy the dead `parseJson<T>` helper — it's unused.

Specific import lists per file:

**`card.ts`** imports:
- `Db` from `./types`
- `{ persistNow }` from `@/db`
- `{ eq, and, inArray, sql, asc }` from `drizzle-orm`
- `* as schema` from `@/db/schema`
- Functions: `createCard`, `updateCard`, `deleteCard`, `getCardById`, `getAllCards`, `searchCards`, `getUntaggedCardsByBundle`, `getCardsByTag`, `getCardsByBundle`, `getCardTags`, `getCardBundles`, `addTagsToCard`

**`tag.ts`** imports:
- `Db` from `./types`
- `{ persistNow }` from `@/db`
- `{ eq, asc }` from `drizzle-orm`
- `* as schema` from `@/db/schema`
- Functions: `createTag`, `getOrCreateTag`, `getAllTags`, `deleteTag`

**`bundle.ts`** imports:
- `Db` from `./types`
- `{ persistNow }` from `@/db`
- `{ eq, and, inArray, sql, asc }` from `drizzle-orm`
- `* as schema` from `@/db/schema`
- Functions: `createBundle`, `updateBundle`, `deleteBundle`, `getAllBundles`, `getBundleById`, `addCardsToBundle`, `removeCardFromBundle`, `reorderBundleCard`, `getBundleExamStats`, `getBundlePastAttempts`, `getBundleCardWeakness`

**`fsrs.ts`** imports:
- `Db` from `./types`
- `{ persistNow }` from `@/db` (used indirectly via `rateCard` — `rateCard` calls `getOrCreateCardFsrs` which doesn't persist, but `rateCard` inserts a review log and should persist)
  - Actually checking: `rateCard` does NOT call `persistNow`. Only `createCard` and mutation functions that need immediate persistence call it. `rateCard` relies on auto-persist. So **`fsrs.ts` does NOT import `persistNow`**.
- Check `db-queries.ts`: `getOrCreateCardFsrs` — no persistNow. `rateCard` — no persistNow. `getDueCards` — no persistNow. Confirm: **no `persistNow` import needed**.
- `{ eq, and, lte, asc }` from `drizzle-orm`
- `{ createEmptyCard, fsrs, Rating, type Grade }` from `ts-fsrs`
- `* as schema` from `@/db/schema`
- Functions: `getOrCreateCardFsrs`, `rateCard`, `getDueCards`

**`exam.ts`** imports:
- `Db` from `./types`
- `{ persistNow }` from `@/db` (used in `completeExamAttempt`)
- `{ eq, and, inArray, sql, asc }` from `drizzle-orm`
- `{ Rating, type Grade }` from `ts-fsrs` — **Wait**: check the actual imports used. `completeExamAttempt` calls `rateCard` from fsrs.ts, so `exam.ts` needs `import { rateCard } from './fsrs'`. It does NOT need `Rating` or `Grade` directly — it uses `Rating.Good` / `Rating.Again` which come from `ts-fsrs`. Check line 683: `const rating = answer.isCorrect ? Rating.Good : Rating.Again;`. So yes, `exam.ts` needs `{ Rating }` from `ts-fsrs`.
- `* as schema` from `@/db/schema`
- `{ rateCard }` from `./fsrs` (cross-service dependency for `completeExamAttempt`)
- Functions: `createExam`, `startExamAttempt`, `getExamById`, `getAllExams`, `submitExamAnswer`, `getExamAnswers`, `getExamQuestions`, `completeExamAttempt`, `getExamResults`

**`ai-provider.ts`** imports:
- `Db` from `./types`
- `{ eq, asc }` from `drizzle-orm`
- `* as schema` from `@/db/schema`
- Functions: `createAiProvider`, `updateAiProvider`, `deleteAiProvider`, `getAllAiProviders`, `getDefaultAiProvider`
- Note: no `persistNow` needed — ai-provider functions don't persist immediately.

**Commit**: `refactor(lib): create per-model service modules`

### Task 1.3: Create barrel export `src/lib/services/index.ts`

**What**: Create a barrel file that re-exports all functions from all six service modules, plus the `Db` type. This preserves the existing public API — any consumer importing `{ X, Y } from "@/lib/db-queries"` can switch to `{ X, Y } from "@/lib/services"` with zero changes to named imports.
**Files**: `src/lib/services/index.ts`
**Implementation notes**:
```ts
export type { Db } from './types';
export { createCard, updateCard, deleteCard, getCardById, getAllCards, searchCards, getUntaggedCardsByBundle, getCardsByTag, getCardsByBundle, getCardTags, getCardBundles, addTagsToCard } from './card';
export { createTag, getOrCreateTag, getAllTags, deleteTag, getTagStats } from './tag';
export { createBundle, updateBundle, deleteBundle, getAllBundles, getBundleById, addCardsToBundle, removeCardFromBundle, reorderBundleCard, getBundleExamStats, getBundlePastAttempts, getBundleCardWeakness } from './bundle';
export { getOrCreateCardFsrs, rateCard, getDueCards } from './fsrs';
export { createExam, startExamAttempt, getExamById, getAllExams, submitExamAnswer, getExamAnswers, getExamQuestions, completeExamAttempt, getExamResults } from './exam';
export { createAiProvider, updateAiProvider, deleteAiProvider, getAllAiProviders, getDefaultAiProvider } from './ai-provider';
```
**Commit**: `refactor(lib): add services barrel export`

---

## Phase 2 — Migrate All Consumers

### Task 2.1: Update all 22 consumer files to import from `@/lib/services`

**What**: In every file that currently imports from `@/lib/db-queries`, change the import path to `@/lib/services`. The named imports remain exactly the same — only the path changes.
**Files** (all 22 consumers):
1. `src/components/card-form.tsx`
2. `src/lib/exchange-import.ts`
3. `src/app/(main)/study-dome/tags/page.tsx`
4. `src/app/(main)/study-dome/tags/[id]/page.tsx`
5. `src/app/(main)/study-dome/cards/page.tsx`
6. `src/app/(main)/study-dome/cards/[id]/page.tsx`
7. `src/app/(main)/study-dome/review/page.tsx`
8. `src/app/(main)/study-dome/exams/[attemptId]/page.tsx`
9. `src/app/(main)/study-dome/exams/[attemptId]/results/page.tsx`
10. `src/app/(main)/study-dome/bundles/page.tsx`
11. `src/app/(main)/study-dome/bundles/new/page.tsx`
12. `src/app/(main)/study-dome/bundles/[id]/page.tsx`
13. `src/app/(main)/study-dome/bundles/[id]/stats/page.tsx`
14. `src/app/(main)/study-dome/bundles/[id]/past-exams/page.tsx`
15. `src/app/(main)/study-dome/bundles/[id]/edit/page.tsx`
16. `src/app/(main)/study-dome/page.tsx`
17. `src/app/(main)/exchange-center/offer/page.tsx`
18. `src/app/(main)/factory/page.tsx`
19. `src/app/(main)/factory/tagger/page.tsx`
20. `src/app/(main)/factory/generate/page.tsx`
21. `src/app/(main)/factory/import/page.tsx`
22. `src/app/(main)/factory/export/page.tsx`

**Implementation notes**:
- For each file, find the `from "@/lib/db-queries"` import and replace it with `from "@/lib/services"`.
- The named imports stay **exactly the same** — no changes to destructured names.
- **Special case**: `src/lib/exchange-import.ts` line 111 has a dynamic `await import("@/lib/db-queries")` for `updateBundle`. Change it to `await import("@/lib/services")`.
- Also remove the local `type Db = SQLJsDatabase<typeof schema>` alias from `exchange-import.ts` (line 7) and replace with `import type { Db } from "@/lib/services/types"`.

**Tests**: Run `pnpm build` to confirm no TypeScript errors.

**Commit**: `refactor(lib): migrate all consumers from db-queries to services`

### Task 2.2: Remove `src/lib/db-queries.ts`

**What**: Delete the old monolithic file now that all consumers point to `@/lib/services`.
**Files**: Delete `src/lib/db-queries.ts`
**Implementation notes**:
- Before deleting, verify with `rg "db-queries"` that zero files reference it.
- Delete the file.
- Run `pnpm build` to confirm clean compilation.

**Tests**: `pnpm build` must pass with zero errors.

**Commit**: `refactor(lib): remove old db-queries monolith`

---

## Phase 3 — Verify & Clean Up

### Task 3.1: Full build verification

**What**: Run the full build and type-check to ensure nothing is broken.
**Implementation notes**:
- Run `pnpm build` — must succeed with no errors.
- Run `pnpm lint` — must pass.

**Commit**: (no commit if passing — this is verification only)

### Task 3.2: Run E2E tests

**What**: Run the existing Playwright E2E test suite to verify no behavioral regressions.
**Implementation notes**:
- Run `pnpm exec playwright test` (or the project's E2E command).
- All existing E2E specs must pass: `card-crud`, `exam-flow`, `exam-fsrs`, `bundle-stats`, `exchange`, `import-export`.

**Commit**: (no commit if passing — this is verification only)

### Task 3.3: Final clean-up — remove dead code

**What**: The `parseJson<T>` helper at line 11–14 of the old `db-queries.ts` was dead code. Confirm it was not carried over into any service file. Also verify no unused imports exist in the service files.
**Implementation notes**:
- Inspect each service file for unused imports.
- Remove any that slipped in during extraction.
- Run `pnpm build` again to confirm.

**Commit**: `refactor(lib): remove unused imports in service modules`