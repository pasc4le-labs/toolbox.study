import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from '@/db/schema';
import { getStats } from '@/lib/services/stats';
import type { Db } from '@/lib/services/types';

describe('getStats', () => {
  let SQL: SqlJsStatic;
  let sqlDb: Database;
  let db: Db;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  function createFreshDb() {
    sqlDb = new SQL.Database();
    db = drizzle(sqlDb, { schema }) as unknown as Db;
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL DEFAULT 'knowledge', front TEXT NOT NULL, back TEXT NOT NULL, explanation TEXT, options TEXT, correct_indices TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bundles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, emoji TEXT, cover_color TEXT, exam_question_count INTEGER, exam_time_limit_seconds INTEGER, exam_difficulty_filter REAL, exam_points_per_correct REAL DEFAULT 1, exam_points_per_wrong REAL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, bundle_id INTEGER, question_count INTEGER NOT NULL, time_limit_seconds INTEGER, difficulty_filter REAL, points_per_correct REAL NOT NULL DEFAULT 1, points_per_wrong REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS exam_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER, score REAL);
      CREATE TABLE IF NOT EXISTS review_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL, rating INTEGER NOT NULL, state INTEGER NOT NULL, due INTEGER NOT NULL, stability REAL NOT NULL, difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL, last_elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL, review INTEGER NOT NULL, learning_steps INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS ai_providers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, provider_type TEXT NOT NULL DEFAULT 'openai-compatible', base_url TEXT NOT NULL, api_key TEXT, model_id TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    `);
  }

  it('returns all zeros when DB is empty', async () => {
    createFreshDb();
    const stats = await getStats(db);
    expect(stats).toEqual({
      cards: 0,
      bundles: 0,
      tags: 0,
      exams: 0,
      examAttempts: 0,
      reviewLogs: 0,
      aiProviders: 0,
      dbSizeKB: null,
    });
  });

  it('returns correct counts after inserting cards and bundles', async () => {
    createFreshDb();
    const now = Date.now();

    await db.insert(schema.cards).values({ type: 'knowledge', front: 'q1', back: 'a1', createdAt: now, updatedAt: now });
    await db.insert(schema.cards).values({ type: 'knowledge', front: 'q2', back: 'a2', createdAt: now, updatedAt: now });
    await db.insert(schema.bundles).values({ title: 'b1', createdAt: now });
    await db.insert(schema.bundles).values({ title: 'b2', createdAt: now });
    await db.insert(schema.bundles).values({ title: 'b3', createdAt: now });

    // insert exam + attempt + review_log + ai_provider
    await db.insert(schema.exams).values({ title: 'e1', questionCount: 10, createdAt: now });
    await db.insert(schema.examAttempts).values({ examId: 1, startedAt: now });
    await db.insert(schema.reviewLogs).values({ cardId: 1, rating: 3, state: 2, due: now, stability: 1, difficulty: 0.5, elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 1, review: now });
    await db.insert(schema.aiProviders).values({ name: 'test', baseUrl: 'http://localhost', modelId: 'test', createdAt: now });

    const stats = await getStats(db);
    expect(stats).toMatchObject({
      cards: 2,
      bundles: 3,
      tags: 0,
      exams: 1,
      examAttempts: 1,
      reviewLogs: 1,
      aiProviders: 1,
      dbSizeKB: null,
    });
  });
});
