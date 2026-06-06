import initSqlJs, { type SqlJsStatic, type Database, type Statement } from 'sql.js';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import { saveDatabase, loadDatabase, deleteDatabase } from './storage';
import * as schema from './schema';
import migrations from './migrations/export.json';

let _SQL: SqlJsStatic | null = null;
let _db: SQLJsDatabase<typeof schema> | null = null;
let _sqlDb: Database | null = null;
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced persist — saves the in-memory DB to IndexedDB after mutations.
 */
function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    if (!_sqlDb) return;
    const data = _sqlDb.export();
    await saveDatabase(data);
    _persistTimer = null;
  }, 300);
}

/**
 * Wrap the sql.js Database.prepare() so that Drizzle ORM write operations
 * trigger automatic persistence to IndexedDB.
 */
function enableAutoPersist(sqlDb: Database): void {
  const origPrepare = sqlDb.prepare.bind(sqlDb);
  sqlDb.prepare = ((...args: Parameters<typeof origPrepare>) => {
    const stmt = origPrepare(...args);
    const sql = typeof args[0] === 'string' ? args[0] : '';
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(sql)) {
      const origRun = stmt.run.bind(stmt);
      stmt.run = function (...runArgs: Parameters<typeof origRun>): ReturnType<typeof origRun> {
        const result = origRun(...runArgs);
        schedulePersist();
        return result;
      };
    }
    return stmt;
  }) as typeof sqlDb.prepare;
}

export async function getDb(): Promise<{
  db: SQLJsDatabase<typeof schema>;
  sqlDb: Database;
}> {
  if (_db && _sqlDb) return { db: _db, sqlDb: _sqlDb };

  if (!_SQL) {
    _SQL = await initSqlJs({
      locateFile: (file) => `/${file}`,
    });
  }

  const saved = await loadDatabase();
  if (saved && saved.byteLength > 0) {
    _sqlDb = new _SQL.Database(saved);
  } else {
    _sqlDb = new _SQL.Database();
  }

  enableAutoPersist(_sqlDb);

  _db = drizzle(_sqlDb, { schema });

  // Apply migrations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_db as any).dialect.migrate(migrations, (_db as any).session, {
    migrationsTable: '__drizzle_migrations',
  });

  schedulePersist();

  return { db: _db, sqlDb: _sqlDb };
}

export async function nukeDb(): Promise<void> {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = null;
  _SQL = null;
  _db = null;
  _sqlDb = null;
  await deleteDatabase();
}

export async function persistNow(): Promise<void> {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = null;
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  await saveDatabase(data);
}
