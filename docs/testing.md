# Testing

This project uses two complementary test suites:

| Type | Tool | Scope |
|------|------|-------|
| **Unit & integration** | [Vitest](https://vitest.dev) | Pure logic (`src/lib/**`), services (`src/lib/services/**`), and cross-service integration (`src/__tests__/integration/**`) |
| **End-to-end** | [Playwright](https://playwright.dev) | Full user flows against a real running dev server (`e2e/*.spec.ts`) |

## Running tests

| Command | What it does |
|---|---|
| `pnpm test` | Run all unit + integration tests once (headless, CI-style) |
| `pnpm test:watch` | Run unit tests in watch mode (re-runs on save) |
| `pnpm test:coverage` | Run unit tests and emit a coverage report (terminal + `lcov` in `coverage/`) |
| `pnpm test:e2e` | Run all Playwright E2E specs (auto-starts dev server) |
| `pnpm test:e2e:headed` | Run E2E in headed mode (visible browser, useful for debugging) |

## Project layout

```
src/
├── __tests__/
│   ├── helpers/
│   │   ├── test-db.ts         # In-memory sql.js + Drizzle + migrations
│   │   ├── test-db.test.ts    # Sanity tests for the helper
│   │   └── factories.ts       # Seed helpers (seedCard, seedTag, ...)
│   └── integration/           # Cross-service integration tests
│       ├── card-fsrs-lifecycle.test.ts
│       ├── exam-lifecycle.test.ts
│       └── import-export-roundtrip.test.ts
├── lib/
│   ├── __tests__/             # Pure-logic unit tests (no DB)
│   │   ├── utils.test.ts
│   │   ├── sqt-parser.test.ts
│   │   ├── exchange-protocol.test.ts
│   │   ├── exchange-chunk.test.ts
│   │   ├── ai-tagger.test.ts
│   │   ├── exchange-import.test.ts
│   │   └── exchange-serialize.test.ts
│   └── services/__tests__/    # Service-layer unit tests (DB-dependent)
│       ├── card.test.ts
│       ├── tag.test.ts
│       ├── bundle.test.ts
│       ├── ai-provider.test.ts
│       ├── fsrs.test.ts
│       └── exam.test.ts
e2e/
├── setup.ts                   # clearIndexedDB(page), waitForDb(page)
├── playwright.config.ts       # baseURL, webServer, project config
└── *.spec.ts                  # One file per E2E suite
```

## Conventions

### File naming

- `*.test.ts` — Unit and integration tests, picked up by Vitest's `include: ["src/**/*.test.ts"]`.
- `*.spec.ts` — Playwright E2E specs, picked up by Playwright's default test discovery.

### Unit + integration tests

Every service test follows the same pattern:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 1. Mock the persistNow boundary so we don't hit IndexedDB
vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { createCard } from "@/lib/services/card";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";

describe("card service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    // 2. Create a fresh in-memory DB with migrations applied
    handle = await createTestDb();
  });

  afterEach(() => {
    // 3. Always destroy the DB to free WASM memory
    destroyTestDb(handle);
  });

  it("creates a card", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
    expect(card.id).toBeGreaterThan(0);
  });
});
```

#### Key helpers

- **`createTestDb()`** — Returns `{ db, sqlDb }` for a fresh in-memory database. All migrations are applied. Foreign keys are enabled (`PRAGMA foreign_keys = ON`) so `ON DELETE CASCADE` works correctly. Each call returns an isolated DB; you can run two side-by-side for round-trip tests.
- **`destroyTestDb(handle)`** — Closes the sql.js WASM database. Always call this in `afterEach` to avoid leaking memory.
- **`seedCard(db, overrides?)`**, **`seedTag(db, name?)`**, **`seedBundle(db, title?)`**, **`seedExam(db, bundleId, overrides?)`**, **`seedAiProvider(db, overrides?)`** — Factory helpers that wrap the real service functions with sensible defaults. No mocking inside factories.

#### Mocking `persistNow`

`persistNow` is the only function in `@/db` called by service code. It writes the in-memory database to IndexedDB. In Node tests, IndexedDB does not exist, so every service test must mock it:

```ts
vi.mock("@/db", () => ({ persistNow: vi.fn() }));
```

Place this **before** any `import` statements that pull in service code (Vitest hoists `vi.mock` calls, but the convention is to keep them at the top for readability).

#### Mocking external services

For modules that call out to the network (e.g. `src/lib/ai-tagger.ts` calls the `ai` package), mock the external package, not the service:

```ts
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: vi.fn((s: unknown) => s),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => ({ chatModel: vi.fn(() => "mock-model") })),
}));
```

See `src/lib/__tests__/ai-tagger.test.ts` for a complete example.

### Integration tests

Integration tests (`src/__tests__/integration/**`) follow the same pattern as service tests but exercise **multiple services together** to verify cross-service behavior. Examples:

- `card-fsrs-lifecycle.test.ts` — Card creation → FSRS auto-init → rating → re-fetching due cards
- `exam-lifecycle.test.ts` — Create bundle + exam → start attempt → submit answers → complete → verify FSRS state was updated
- `import-export-roundtrip.test.ts` — Build data in one DB, serialize, import into a second DB, verify the round-trip preserves all fields and remaps IDs

Integration tests use **two** `createTestDb()` handles when round-tripping is needed (source + destination). Each handle is destroyed in `afterEach`.

### E2E tests

Every E2E spec starts by clearing the database:

```ts
import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});
```

`clearIndexedDB(page)` calls the app's `window.__nukeDb()` (exposed in dev mode by `src/components/db-reset.tsx`) to wipe the database, then reloads the page so it re-initializes fresh.

Tips for writing new E2E specs:

- **Use the existing factory helpers** to seed data via the UI rather than poking the DB directly — tests should mirror real user behavior.
- **Wait for `networkidle`** after navigation, and add small `waitForTimeout(...)` calls after dialog interactions that trigger async state changes.
- **Prefer user-facing selectors** — `getByText("Create Card")`, `getByRole("button", { name: "Good" })`, `locator("#front")` — over CSS class selectors that may change.
- **Auto-accept `window.confirm` dialogs** with `page.on("dialog", (d) => d.accept())` before triggering the action.

## Coverage

`pnpm test:coverage` emits a coverage summary to the terminal and an `lcov` report to `coverage/lcov.info`. Current config:

- **Provider**: `v8` (fast, no instrumentation build step)
- **Include**: `src/lib/**` and `src/lib/services/**`
- **Exclude**: `src/__tests__/**` and `src/lib/**/types.ts`

Current coverage (as of the last test run):

| File group | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| All files | 94% | 75% | 98% | 96% |
| `lib/` (pure logic) | 94% | 75% | 94% | 94% |
| `lib/services/` | 95% | 75% | 100% | 98% |

## Adding a new test

1. **Pick the right location**:
   - Pure logic with no DB → `src/lib/__tests__/Foo.test.ts`
   - DB-dependent service function → `src/lib/services/__tests__/Foo.test.ts`
   - Cross-service workflow → `src/__tests__/integration/Foo.test.ts`
   - User-facing flow through the UI → `e2e/Foo.spec.ts`

2. **Follow the existing patterns** above. Run `pnpm test` (or `pnpm test:watch`) to iterate.

3. **Commit with a Conventional Commits message** (e.g. `test(services): add unit tests for foo service`).
