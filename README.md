# studying-tools

A local-first study companion built with Next.js. Features flashcard review with FSRS spaced repetition, AI-generated cards, exams, and **P2P exchange** via WebRTC. All data lives in an in-memory SQLite database (sql.js) persisted to IndexedDB — no backend required for core functionality.

## Tech stack

| What | Why |
|------|-----|
| [Next.js (App Router)](https://nextjs.org) | React framework |
| [Drizzle ORM](https://orm.drizzle.team) | Type-safe SQL query builder |
| [sql.js](https://github.com/sql-js/sql.js) | SQLite compiled to WebAssembly — runs in the browser |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Stores the sql.js database snapshot (`Uint8Array`) so data survives page reloads |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling |
| [shadcn/ui](https://ui.shadcn.com) | UI primitives |
| [simple-peer-light](https://github.com/mitschabaude/simple-peer-light) | WebRTC data channel wrapper |
| [coder/websocket](https://github.com/coder/websocket) | Go WebSocket signaling library |

## How it works

```
                ┌─────────────────────────────────┐
                │         Next.js (React)          │
                │         ┌──────────────────┐     │
                │         │    page.tsx       │     │
                │         │  (CRUD todo app)  │     │
                │         └────────┬─────────┘     │
                │                  │                │
                │         ┌────────▼─────────┐     │
                │         │   db/index.ts     │     │
                │         │  (Drizzle ORM)    │     │
                │         │  db.select()...   │     │
                │         │  db.insert()...   │     │
                │         │  db.update()...   │     │
                │         │  db.delete()...   │     │
                │         └────────┬─────────┘     │
                │                  │                │
                │         ┌────────▼─────────┐     │
                │         │    sql.js         │     │
                │         │  (SQLite in WASM) │     │
                │         │  in-memory .db    │     │
                │         └──┬───────────┬────┘     │
                │            │           │          │
                │      export()      load from      │
                │      Uint8Array    Uint8Array      │
                │            │           │          │
                │    ┌───────▼───────────▼────┐     │
                │    │     storage.ts          │     │
                │    │   (IndexedDB wrapper)   │     │
                │    │   saveDatabase(data)    │     │
                │    │   loadDatabase()        │     │
                │    └────────────────────────┘     │
                └─────────────────────────────────────┘
```

1. On first load, `sql.js` spins up a SQLite instance in WebAssembly.
2. An in-memory database is created (empty or restored from IndexedDB).
3. `drizzle-kit`-generated migrations are applied to bring the schema up to date.
4. Drizzle ORM wraps the sql.js instance and exposes typed query builders.
5. After every write (insert/update/delete), `persistNow()` serializes the db via `sqlDb.export()` → `Uint8Array` and stores it in IndexedDB.
6. On subsequent page loads, the `Uint8Array` is read from IndexedDB and fed back to `new SQL.Database(bytes)` — data is restored. Migrations that were already applied are skipped (tracked by a `__drizzle_migrations` table).

## Project structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Todo UI (CRUD + query demos + Nuke DB button)
│   └── globals.css         # Tailwind styles
├── db/
│   ├── schema.ts           # Drizzle table definitions (todos)
│   ├── storage.ts          # IndexedDB save/load/delete helpers
│   ├── index.ts            # DB init — WASM load, restore, migrations, Drizzle wrap
│   └── migrations/         # drizzle-kit generated files + export.json
│       ├── *.sql           # Migration SQL (one per change)
│       ├── export.json     # Browser-importable bundle of all migrations
│       └── meta/           # Journal + schema snapshots
├── components/ui/          # shadcn/ui components
├── scripts/
│   └── export-migrations.ts # Build-time bundler: .sql → export.json
└── lib/utils.ts            # Shared utilities

drizzle.config.ts           # drizzle-kit config (sqlite)
```

## Getting started

```bash
pnpm install      # installs deps + copies sql.js .wasm files to public/
pnpm dev          # starts dev server at http://localhost:3000
```

### Build

```bash
pnpm build        # production build
pnpm start        # run production build
```

## Migrations

Schema changes are managed through **drizzle-kit** migrations. The pipeline works entirely client-side — `.sql` files are generated during development, exported to a JSON bundle at build time, and applied in the browser at runtime.

### Workflow

1. Edit `src/db/schema.ts` (add a table, change a column, etc.)
2. Generate the migration SQL and re-export:

   ```bash
   pnpm db:migrate
   ```

   This runs `drizzle-kit generate` (creates a new `.sql` file in `src/db/migrations/`) then `scripts/export-migrations.ts` (bundles all migrations into `src/db/migrations/export.json`).

3. Restart the dev server — new schema is applied automatically on page load.

### Manual steps

| Command | What it does |
|---|---|
| `pnpm db:generate` | Create a new `.sql` migration from schema diff |
| `pnpm db:export` | Re-bundle all `.sql` files into `export.json` (run after editing a migration manually) |
| `pnpm db:migrate` | Both of the above in one step |

### Nuke & restart

If you need to wipe the database and re-run all migrations from scratch, click the **Nuke DB** button on the demo page (or delete the IndexedDB database from dev tools). On reload, migrations will run fresh.

### How it works at runtime

```
  drizzle-kit generate ──→ .sql files (src/db/migrations/*.sql)
                                  ↓
         scripts/export-migrations.ts
         (readMigrationFiles + JSON.stringify)
                                  ↓
               export.json (bundled with the app)
                                  ↓
         db.dialect.migrate() at runtime
         (creates __drizzle_migrations tracking table,
          skips already-applied migrations)
```

The `__drizzle_migrations` table records each migration's hash and timestamp. On subsequent loads, if the last applied migration's timestamp matches the latest `.sql` file's timestamp, nothing runs — the schema is already up to date.

## WASM files

`sql.js` ships two WebAssembly binaries (`sql-wasm.wasm`, `sql-wasm-browser.wasm`) that must be served as static files. A `postinstall` script (`copy-wasm.mjs`) copies them from `node_modules/sql.js/dist/` to `public/`. They are gitignored — re-run `pnpm install` to get them.

## Key files

- **`src/db/schema.ts`** — Single `todos` table with `id`, `title`, `done` (boolean mode), `created_at`.
- **`src/db/storage.ts`** — Two functions: `saveDatabase(Uint8Array)` and `loadDatabase()`, wrapping the native IndexedDB API.
- **`src/db/index.ts`** — Singleton DB init. Calls `initSqlJs()` → loads from IndexedDB or creates fresh → applies migrations via `dialect.migrate()` → wraps with `drizzle()`. Also exports `nukeDb()` to reset the database.
- **`src/db/schema.ts`** — Drizzle table definitions; source of truth for `drizzle-kit` migrations.
- **`src/db/migrations/`** — Auto-generated `.sql` files + `meta/` journal + `export.json` (the browser-importable bundle).
- **`drizzle.config.ts`** — drizzle-kit configuration (sqlite dialect, output folder, timestamp prefix).
- **`scripts/export-migrations.ts`** — Build-time script that bundles `.sql` files into `export.json` using `drizzle-orm/migrator`'s `readMigrationFiles()`.
- **`src/app/page.tsx`** — Todo list UI with add/toggle/delete, search filter, demo buttons for `COUNT`/`LIKE`/`LIMIT`, and a **Nuke DB** button to wipe and re-migrate.

## Design & Layout

StudyToolbox is built with a **local-first, mobile-first approach**:

- **Safe-area aware**: Respects iOS notches, Dynamic Islands, and home indicators via CSS `env(safe-area-inset-*)`
- **Sticky footer**: Footer always stays at the bottom using flexbox (`flex-1` on main content)
- **Responsive**: Optimized for mobile (375px), tablet (768px), and desktop (1024px+)
- **Touch-friendly**: All interactive elements meet 48px tap targets
- **Dark mode**: System-aware light/dark theme powered by [`next-themes`](https://github.com/pacocoursey/next-themes). Switch from the sun/moon toggle in the navbar (or inside the mobile menu) between Light, Dark, and System. Theme is persisted to `localStorage` and applied as a `class` on `<html>` so it paints correctly before hydration.

### Spacing Grid

Built on a consistent 4px/8px grid using Tailwind's spacing scale.

## Applets

- **Study Dome** — Review cards, manage bundles & tags, take exams, track progress with FSRS.
- **AI Factory** — Generate flashcards from any content using OpenAI-compatible AI providers.
- **Exchange Center** — Share cards, bundles, and exams peer-to-peer via WebRTC. Uses a lightweight Go relay for initial signaling.

## Relay

The Exchange Center requires a signaling relay to pair browsers. A standalone Go service lives in `relay/`:

```bash
cd relay
go run .
```

See [`docs/relay-deployment.md`](docs/relay-deployment.md) for Docker and production deployment.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — System architecture and data flow
- [`docs/exchange-center.md`](docs/exchange-center.md) — How to use the Exchange Center
- [`docs/relay-deployment.md`](docs/relay-deployment.md) — Relay deployment guide
- [`docs/responsive.md`](docs/responsive.md) — Responsive design conventions, dark mode, and E2E coverage
- [`docs/testing.md`](docs/testing.md) — Running and writing tests (unit, integration, E2E)

## Testing

The project has 200+ Vitest unit/integration tests and 40+ Playwright E2E tests covering all `lib/**` and `lib/services/**` modules plus major user flows.

```bash
pnpm test              # unit + integration tests
pnpm test:watch        # unit tests in watch mode
pnpm test:coverage     # unit tests with coverage report
pnpm test:e2e          # Playwright E2E suite (auto-starts dev server)
pnpm test:e2e:headed   # E2E in headed mode for debugging
```

See [`docs/testing.md`](docs/testing.md) for the full guide, including how to add new tests.
