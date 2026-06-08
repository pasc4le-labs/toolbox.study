<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

- **Install / setup:** `pnpm install` (copies sql.js WASM files to `public/` via postinstall — these are gitignored, so this step is mandatory after clone)
- **Dev:** `pnpm dev`
- **Lint:** `pnpm lint`
- **Typecheck:** `pnpm typecheck`
- **Unit tests:** `pnpm test` (Vitest, `src/**/*.test.ts`)
- **Unit test watch:** `pnpm test:watch`
- **Coverage:** `pnpm test:coverage` (covers `src/lib/**` and `src/lib/services/**` only)
- **E2E:** `pnpm test:e2e` (Playwright, runs from `e2e/` dir, auto-starts dev server)
- **E2E headed:** `pnpm test:e2e:headed`
- **Build:** `pnpm build`
- **DB migrations:** `pnpm db:migrate` (generates `.sql` then bundles into `export.json`)
- **Relay (Go signaling server):** `cd relay && go run .`

Always run `lint` then `typecheck` then `test` in that order before considering changes done.

## Architecture

- **Local-first, no backend DB.** All data lives in an in-memory SQLite (sql.js/WASM) persisted to IndexedDB as a `Uint8Array`. Drizzle ORM wraps sql.js for typed queries.
- **Client-side migrations.** Schema changes go through `drizzle-kit generate` → `scripts/export-migrations.ts` bundles `.sql` files into `src/db/migrations/export.json` → applied at runtime in the browser via `db.dialect.migrate()`.
- **Auto-persist.** `src/db/index.ts` monkey-patches `sqlDb.prepare()` so INSERT/UPDATE/DELETE/CREATE/DROP/ALTER statements trigger a debounced `persistNow()` that saves the DB snapshot to IndexedDB.
- **React Compiler** is enabled (`reactCompiler: true` in `next.config.ts`). Don't add `useMemo`/`useCallback` optimizations that the compiler handles.
- **Tailwind CSS v4** (not v3) with `@tailwindcss/postcss` plugin. Uses the new v4 syntax/config.
- **shadcn/ui** (style: `radix-mira`, icons: `remixicon`, base color: `taupe`). Components live in `src/components/ui/`.
- **Route group:** `src/app/(main)/` wraps Study Dome, Factory, and Exchange Center with a shared Navbar + Footer layout.

## Key directories

| Path | Purpose |
|---|---|
| `src/db/schema.ts` | Drizzle table definitions (source of truth for migrations) |
| `src/db/index.ts` | DB init, WASM load, IndexedDB restore, auto-persist, `getDb()` |
| `src/db/storage.ts` | IndexedDB save/load/delete helpers |
| `src/db/migrations/export.json` | Browser-importable migration bundle (auto-generated, do not edit) |
| `src/lib/services/` | Business logic (card, bundle, tag, exam, fsrs, ai-provider) |
| `src/lib/` | Shared utilities (exchange protocol, SQT parser, AI tagger) |
| `src/app/(main)/study-dome/` | Flashcard review, bundles, tags, exams |
| `src/app/(main)/factory/` | AI card generation, import/export |
| `src/app/(main)/exchange-center/` | P2P card/bundle exchange via WebRTC |
| `relay/` | Go WebSocket signaling server for Exchange Center |
| `e2e/` | Playwright E2E tests (separate from unit tests) |
| `src/app/(main)/settings/` | Settings page (stats, preferences, syncing, about) |
| `src/app/(main)/settings/_components/` | Settings sub-components (tabs, provider) |

## DB schema changes

1. Edit `src/db/schema.ts`
2. Run `pnpm db:migrate` (generates `.sql` + re-bundles `export.json`)
3. Restart dev server — migrations apply automatically on page load

To nuke and start fresh: clear IndexedDB from browser dev tools or use the Nuke DB button in the UI.

## E2E tests

Playwright config is in `e2e/playwright.config.ts`. It auto-starts the dev server. Project names: `chromium`, `mobile-chrome`, `mobile-safari`. Responsive layout tests only run under mobile projects.

## Env vars

- `NEXT_PUBLIC_RELAY_URL` — WebSocket URL for the Exchange Center signaling relay (e.g. `ws://localhost:8080/ws`). See `.env.example`.
- `NEXT_PUBLIC_GEMINI_UQF_GEM` — Optional URL to a Gemini Gem that generates UQF flashcards. When set, a "Gemini Gem" button appears on the UQF Import tab.
- `NEXT_PUBLIC_GEMINI_JSON_GEM` — Optional URL to a Gemini Gem that generates JSON flashcards. When set, a "Gemini Gem" button appears on the JSON Import tab.
- `NEXT_PUBLIC_APP_VERSION` — Optional override for the app version shown in Settings > About. Falls back to `package.json` version.

## Gotchas

- WASM files (`public/sql-wasm*.wasm`) are gitignored; they're copied during `pnpm install` via `copy-wasm.mjs`. If they're missing, re-run `pnpm install`.
- `src/db/migrations/export.json` is auto-generated. Never edit it directly — always run `pnpm db:generate && pnpm db:export` (or `pnpm db:migrate`).
- The relay is Go, not Node. It lives in `relay/` with its own `go.mod`.
- `__drizzle_migrations` table tracks applied migrations client-side; already-applied migrations are skipped on reload.