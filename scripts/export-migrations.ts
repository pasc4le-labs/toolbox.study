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
