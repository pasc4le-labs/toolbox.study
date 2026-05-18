# PLAN: Add Drizzle Migrations with sql.js

## Overview

Currently, `src/db/index.ts` has a hardcoded `CREATE TABLE IF NOT EXISTS` SQL string. This plan replaces that with a proper **drizzle-kit migration pipeline**: generate SQL migrations with drizzle-kit → export them to a JSON file at build time → apply them at runtime in the browser via sql.js.

This mirrors the approach used in `drizzle-on-indexeddb` (the fork), adapted for **SQLite + sql.js** instead of PostgreSQL + PGlite.

---

## Phase 1: Install drizzle-kit

### Goal
Add `drizzle-kit` as a dev dependency so we can generate SQL migration files from the Drizzle schema.

### Steps

1. Run this command in the project root (`/Users/peppe/Developer/Personal/prj/studying-tools`):

```bash
pnpm add -D drizzle-kit
```

2. **Verify**: After install, check that `drizzle-kit` appears in `devDependencies` in `package.json`. Expected version: anything `>=0.24.0` (compatible with drizzle-orm 0.45.x).

---

## Phase 2: Create drizzle.config.ts

### Goal
Tell drizzle-kit where the schema file is, what dialect to use, and where to output migration files.

### Steps

1. Create a new file: **`/Users/peppe/Developer/Personal/prj/studying-tools/drizzle.config.ts`**

   File contents:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  verbose: true,
  migrations: { prefix: "timestamp" },
});
```

**Explanation:**
- `dialect: "sqlite"` → We're using SQLite (what sql.js is).
- `schema` → Points to the file with our `sqliteTable()` definitions.
- `out` → Where generated `.sql` files go.
- `migrations: { prefix: "timestamp" }` → Migration files will be named like `20240101000000_abc.sql`.

---

## Phase 3: Add npm scripts

### Goal
Add convenient `package.json` scripts for generating and exporting migrations.

### Steps

Open `/Users/peppe/Developer/Personal/prj/studying-tools/package.json`.

**Find** the `"scripts"` block (around line 5-10). It currently looks like:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "postinstall": "node copy-wasm.mjs"
},
```

**Replace** it with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "postinstall": "node copy-wasm.mjs",
  "db:generate": "drizzle-kit generate",
  "db:export": "npx tsx scripts/export-migrations.ts",
  "db:migrate": "pnpm db:generate && pnpm db:export"
},
```

**Explanation:**
- `db:generate` → Runs drizzle-kit to create `.sql` files from the schema.
- `db:export` → Runs the export script (we'll create it in Phase 5) to bundle the `.sql` files into a JSON file that can be imported in the browser.
- `db:migrate` → Runs both in sequence. This is the main command you'll use when you change the schema.

---

## Phase 4: Generate the first migration

### Goal
Let drizzle-kit generate the SQL for the existing `todos` table from `src/db/schema.ts`.

### Steps

1. Make sure the schema file exists and is correct. It should be at:

   **`/Users/peppe/Developer/Personal/prj/studying-tools/src/db/schema.ts`**

   Current content (already correct — nothing to change here at this stage):

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Todos table ──
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
```

2. Run the generate command:

```bash
pnpm db:generate
```

If there's an existing migration folder with old files, drizzle-kit may ask if you want to delete them — say yes.

3. **Verify**: After running, check that these files were created:

```
src/db/migrations/
├── 0000_xxxxxxxx_xxxxxx.sql          # The SQL migration
└── meta/
    ├── _journal.json                  # Migration journal (tracks what migrations exist)
    └── 0000_snapshot.json            # Schema snapshot
```

   The exact timestamp prefix will vary. Look inside the `.sql` file (e.g., with VS Code or `cat`). It should contain:

```sql
CREATE TABLE `todos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `done` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL
);
```

**Troubleshooting:**
- If drizzle-kit says "schema file not found", double-check the path in `drizzle.config.ts` is `./src/db/schema.ts` (relative to project root).
- If it creates PostgreSQL SQL instead of SQLite, check that `dialect: "sqlite"` is set in `drizzle.config.ts`.
- If it fails with TypeScript errors about the schema, make sure `drizzle-orm` is installed.

---

## Phase 5: Create the export script

### Goal
Create a Node.js script that reads the generated `.sql` migration files and writes them as a single JSON file inside `src/db/migrations/`. This JSON is then imported at runtime in the browser (since the browser can't read the filesystem).

### Steps

1. Create a new folder and file:

   **`/Users/peppe/Developer/Personal/prj/studying-tools/scripts/export-migrations.ts`**

   File contents:

```typescript
import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

const MIGRATIONS_FOLDER = path.resolve("src/db/migrations");
const OUTPUT_FILE = path.resolve("src/db/migrations/export.json");

// readMigrationFiles reads the _journal.json and all .sql files,
// returning an array of { sql: string[], bps: boolean, folderMillis: number, hash: string }
const migrations = readMigrationFiles({
  migrationsFolder: MIGRATIONS_FOLDER,
});

// Write as JSON. Each migration entry has:
//   sql: string[]     → each element is one SQL statement (split on --> statement-breakpoint)
//   bps: boolean      → breakpoints flag
//   folderMillis: number → timestamp from the journal
//   hash: string      → SHA256 hash of the migration SQL
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(migrations, null, 2), "utf-8");

console.log(
  `✅ Exported ${migrations.length} migration(s) to ${OUTPUT_FILE}`
);
```

2. Run the export command:

```bash
pnpm db:export
```

3. **Verify**: Check that the file was created:

```
src/db/migrations/export.json
```

   It should look like a JSON array. Example:

```json
[
  {
    "sql": [
      "CREATE TABLE `todos` (\n  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n  `title` text NOT NULL,\n  `done` integer DEFAULT false NOT NULL,\n  `created_at` integer NOT NULL\n);\n"
    ],
    "bps": true,
    "folderMillis": 1234567890123,
    "hash": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  }
]
```

**Troubleshooting:**
- If you get `Can't find meta/_journal.json file`, make sure you ran `pnpm db:generate` first (Phase 4).
- If you get module errors about `node:` prefixes, make sure you have a recent Node.js version (>=18). The project already uses Node >=20.

---

## Phase 6: Update src/db/index.ts to use migrations at runtime

### Goal
Replace the hardcoded `CREATE_SQL` string with proper migration running. When the app starts in the browser, it should:
1. Init sql.js
2. Load any saved database from IndexedDB
3. Apply pending migrations from `export.json`
4. Persist the migrated database back to IndexedDB

### Steps

Open **`/Users/peppe/Developer/Personal/prj/studying-tools/src/db/index.ts`**.

**Replace the entire file** with this content:

```typescript
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import { saveDatabase, loadDatabase } from "./storage";
import * as schema from "./schema";
// Import the pre-exported migrations JSON (generated by scripts/export-migrations.ts)
import migrations from "./migrations/export.json";

let _SQL: SqlJsStatic | null = null;
let _db: SQLJsDatabase<typeof schema> | null = null;
let _sqlDb: Database | null = null;

export async function getDb(): Promise<{
  db: SQLJsDatabase<typeof schema>;
  sqlDb: Database;
}> {
  if (_db && _sqlDb) return { db: _db, sqlDb: _sqlDb };

  // 1. Init sql.js (load WASM)
  if (!_SQL) {
    _SQL = await initSqlJs({
      locateFile: (file) => `/${file}`,
    });
  }

  // 2. Load saved database from IndexedDB, or create a fresh one
  const saved = await loadDatabase();

  if (saved && saved.byteLength > 0) {
    _sqlDb = new _SQL.Database(saved);
  } else {
    _sqlDb = new _SQL.Database();
  }

  // 3. Create Drizzle instance
  _db = drizzle(_sqlDb, { schema });

  // 4. Apply migrations
  //    dialect.migrate() accepts the MigrationMeta[] array directly,
  //    bypassing the filesystem (which doesn't exist in the browser).
  //    It uses a __drizzle_migrations table internally to track which
  //    migrations have already been applied — so it's idempotent.
  _db.dialect.migrate(migrations, _db.session, {
    migrationsTable: "__drizzle_migrations",
  });

  // 5. Persist the migrated database back to IndexedDB
  await persistNow();

  return { db: _db, sqlDb: _sqlDb };
}

/** Serialize the in-memory database to IndexedDB. */
export async function persistNow(): Promise<void> {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  await saveDatabase(data);
}
```

**Key changes explained:**
- The `CREATE_SQL` constant is **gone**. It's replaced by migrations.
- `import migrations from "./migrations/export.json"` — imports the pre-bundled JSON.
- `_db.dialect.migrate(migrations, _db.session, { migrationsTable: "__drizzle_migrations" })` — this is the magic line. It runs all pending migrations. It creates a `__drizzle_migrations` table in SQLite to track which migrations have been applied. If the app loads an already-migrated database from IndexedDB, it will find the tracking table and skip migrations that were already applied.
- The `migrationsTable` option defaults to `"__drizzle_migrations"` anyway, but we set it explicitly for clarity.

**Why this works in the browser:**
- `readMigrationFiles()` (used in the export script) runs in **Node.js** at build time — it has filesystem access.
- The exported JSON is a normal TypeScript import — the bundler (Next.js/webpack) inlines it into the client bundle.
- `db.dialect.migrate()` takes the in-memory array — no filesystem needed.

---

## Phase 7: Handle the postinstall WASM copy

### Goal
Make sure the sql.js WASM files are in `public/` so they're served at `/sql-wasm.wasm`.

### Steps

The existing `copy-wasm.mjs` script does this already. No changes needed. Verify it works:

```bash
ls -la public/sql-wasm*.wasm
```

You should see at least one `.wasm` file. If not, run:

```bash
node copy-wasm.mjs
```

---

## Phase 8: Test everything

### Goal
Make sure the app builds, the database initializes with migrations, and the `todos` table works.

### Steps

1. **Clean any old IndexedDB data** (so you start fresh and see the migration run):

   Open your browser's DevTools → Application → IndexedDB → `studying-tools-db` → Delete database.

   OR in the browser console, run:
   ```javascript
   indexedDB.deleteDatabase('studying-tools-db');
   ```

2. **Start the dev server:**

   ```bash
   pnpm dev
   ```

3. **Open the browser console and check for errors.** You should NOT see any migration errors.

4. **Verify the migration ran by checking the console.** Add a temporary log in `getDb()` if needed:

   After the `_db.dialect.migrate(...)` line, temporarily add:
   ```typescript
   console.log("Migrations applied successfully");
   ```

5. **Verify the table exists** by running a quick query in the browser console. In your app's page component, you can add a temporary effect:

   ```tsx
   useEffect(() => {
     getDb().then(({ db }) => {
       db.select().from(schema.todos).all().then(console.log);
     });
   }, []);
   ```

6. **Build a production build** to make sure the JSON import works with the bundler:

   ```bash
   pnpm build
   ```

   It should complete without errors.

---

## Phase 9: Future workflow (when you change the schema)

### Goal
Know what to do when you add/modify tables in `src/db/schema.ts`.

### Steps

Every time you edit the schema file:

1. **Edit** `src/db/schema.ts` (add a new table, add a column, etc.)

2. **Generate** a new migration:
   ```bash
   pnpm db:generate
   ```
   This creates a new `.sql` file in `src/db/migrations/` with only the diff (e.g., `ALTER TABLE ... ADD COLUMN ...` or `CREATE TABLE ...`).

3. **Export** the updated migrations JSON:
   ```bash
   pnpm db:export
   ```
   This regenerates `export.json` with all migrations (old + new).

4. **Or do both in one command:**
   ```bash
   pnpm db:migrate
   ```

5. **Test** with `pnpm dev` — the new migration will be applied automatically. If the database already exists in IndexedDB, only the new migration will run (the tracking table prevents re-running old ones).

**Important:** If you need to write a CUSTOM migration (e.g., data transformation, not just DDL), use:

```bash
pnpm drizzle-kit generate --custom
```

This creates an empty migration SQL file where you can write your own custom SQL. Then export as usual.

---

## Summary of new/changed files

| File | Action |
|---|---|
| `package.json` | **Edit** — Add `drizzle-kit` to devDeps, add `db:generate`/`db:export`/`db:migrate` scripts |
| `drizzle.config.ts` | **Create** — drizzle-kit configuration |
| `scripts/export-migrations.ts` | **Create** — Export script that bundles SQL files into JSON |
| `src/db/migrations/*.sql` | **Auto-generated** — Created by `drizzle-kit generate` |
| `src/db/migrations/meta/_journal.json` | **Auto-generated** — Created by `drizzle-kit generate` |
| `src/db/migrations/export.json` | **Auto-generated** — Created by export script |
| `src/db/index.ts` | **Edit** — Replace hardcoded SQL with migration runner |

---

## One thing to watch out for

The `Date.now()` default in the schema:

```typescript
createdAt: integer('created_at').notNull().default(Date.now()),
```

This calls `Date.now()` at **module evaluation time** (when the file is first imported). The generated SQL migration will have the timestamp that was current when `drizzle-kit generate` ran. This is fine — the default in the migration is only used when a row is inserted without an explicit value, and our app code typically sets `createdAt` with `Date.now()` at insert time anyway.

But if you want the SQLite default to be dynamic (evaluated at insert time, not at schema definition time), you can't — SQLite defaults must be literals. The current behavior is correct for how the app works.
