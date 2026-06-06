import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { resolve } from "path";
import * as schema from "@/db/schema";
import migrations from "@/db/migrations/export.json";
import type { Db } from "@/lib/services/types";

let _SQL: SqlJsStatic | null = null;

async function getSQL(): Promise<SqlJsStatic> {
  if (_SQL) return _SQL;
  _SQL = await initSqlJs({
    locateFile: (file) => resolve(process.cwd(), "node_modules/sql.js/dist", file),
  });
  return _SQL;
}

export interface TestDbHandle {
  db: Db;
  sqlDb: Database;
}

export async function createTestDb(): Promise<TestDbHandle> {
  const SQL = await getSQL();
  const sqlDb = new SQL.Database();
  sqlDb.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlDb, { schema });

  (db as any).dialect.migrate(migrations, (db as any).session, {
    migrationsTable: "__drizzle_migrations",
  });

  return { db: db as Db, sqlDb };
}

export function destroyTestDb(handle: TestDbHandle): void {
  handle.sqlDb.close();
}
