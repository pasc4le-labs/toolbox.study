import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { Db } from './types';

export type AppStats = {
  cards: number;
  bundles: number;
  tags: number;
  exams: number;
  examAttempts: number;
  reviewLogs: number;
  aiProviders: number;
  dbSizeKB: number | null;
};

export async function getStats(db: Db): Promise<AppStats> {
  const [cardResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.cards);
  const [bundleResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.bundles);
  const [tagResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.tags);
  const [examResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.exams);
  const [attemptResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.examAttempts);
  const [reviewResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.reviewLogs);
  const [aiResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.aiProviders);

  return {
    cards: cardResult.count,
    bundles: bundleResult.count,
    tags: tagResult.count,
    exams: examResult.count,
    examAttempts: attemptResult.count,
    reviewLogs: reviewResult.count,
    aiProviders: aiResult.count,
    dbSizeKB: null,
  };
}
