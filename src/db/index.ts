import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import { saveDatabase, loadDatabase } from './storage';
import * as schema from './schema';

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`;

let _SQL: SqlJsStatic | null = null;
let _db: SQLJsDatabase<typeof schema> | null = null;
let _sqlDb: Database | null = null;

export async function getDb(): Promise<{
  db: SQLJsDatabase<typeof schema>;
  sqlDb: Database;
}> {
  if (_db && _sqlDb) return { db: _db, sqlDb: _sqlDb };

  if (!_SQL) {
    _SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }

  // Try loading saved database from IndexedDB
  const saved = await loadDatabase();

  if (saved && saved.byteLength > 0) {
    _sqlDb = new _SQL.Database(saved);
  } else {
    _sqlDb = new _SQL.Database();
    _sqlDb.run(CREATE_SQL);
    // Persist the initial empty database
    await persistNow();
  }

  _db = drizzle(_sqlDb, { schema });
  return { db: _db, sqlDb: _sqlDb };
}

/** Serialize the in-memory database to IndexedDB. */
export async function persistNow(): Promise<void> {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  await saveDatabase(data);
}
