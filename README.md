# studying-tools

A Next.js playground for trying out dev tools, libraries, and browser APIs. Currently exploring **Drizzle ORM + sql.js + IndexedDB** — a fully client-side SQLite stack that runs in the browser with no backend.

## Tech stack

| What | Why |
|------|-----|
| [Next.js (App Router)](https://nextjs.org) | React framework |
| [Drizzle ORM](https://orm.drizzle.team) | Type-safe SQL query builder |
| [sql.js](https://github.com/sql-js/sql.js) | SQLite compiled to WebAssembly — runs in the browser |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Stores the sql.js database snapshot (`Uint8Array`) so data survives page reloads |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling |
| [shadcn/ui](https://ui.shadcn.com) | UI primitives |

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
2. An in-memory database is created, tables are created via raw SQL.
3. Drizzle ORM wraps the sql.js instance and exposes typed query builders.
4. After every write (insert/update/delete), `persistNow()` serializes the db via `sqlDb.export()` → `Uint8Array` and stores it in IndexedDB.
5. On subsequent page loads, the `Uint8Array` is read from IndexedDB and fed back to `new SQL.Database(bytes)` — data is restored.

## Project structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Todo UI (CRUD + query demos)
│   └── globals.css         # Tailwind styles
├── db/
│   ├── schema.ts           # Drizzle table definitions (todos)
│   ├── storage.ts          # IndexedDB save/load helpers
│   └── index.ts            # DB init — WASM load, restore from IndexedDB, Drizzle wrap
├── components/ui/          # shadcn/ui components
└── lib/utils.ts            # Shared utilities
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

## WASM files

`sql.js` ships two WebAssembly binaries (`sql-wasm.wasm`, `sql-wasm-browser.wasm`) that must be served as static files. A `postinstall` script (`copy-wasm.mjs`) copies them from `node_modules/sql.js/dist/` to `public/`. They are gitignored — re-run `pnpm install` to get them.

## Key files

- **`src/db/schema.ts`** — Single `todos` table with `id`, `title`, `done` (boolean mode), `created_at`.
- **`src/db/storage.ts`** — Two functions: `saveDatabase(Uint8Array)` and `loadDatabase()`, wrapping the native IndexedDB API.
- **`src/db/index.ts`** — Singleton DB init. Calls `initSqlJs()` → loads from IndexedDB or creates fresh → runs `CREATE TABLE` → wraps with `drizzle()`.
- **`src/app/page.tsx`** — Todo list UI with add/toggle/delete, search filter, and demo buttons for `COUNT`, `LIKE`, `LIMIT` queries.

## Upcoming experiments

todo.
