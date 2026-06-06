import { eq, and, inArray, sql, asc } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { persistNow } from '@/db';
import type { Db } from './types';

export async function createBundle(db: Db, data: { title: string; description?: string | null }) {
  const [bundle] = await db
    .insert(schema.bundles)
    .values({ title: data.title, description: data.description ?? null })
    .returning();
  if (bundle) await persistNow();
  return bundle ?? null;
}

export async function updateBundle(db: Db, id: number, data: {
  title?: string;
  description?: string | null;
  examQuestionCount?: number | null;
  examTimeLimitSeconds?: number | null;
  examDifficultyFilter?: number | null;
  examPointsPerCorrect?: number | null;
  examPointsPerWrong?: number | null;
}) {
  await db.update(schema.bundles).set(data).where(eq(schema.bundles.id, id));
  await persistNow();
}

export async function deleteBundle(db: Db, id: number) {
  await db.delete(schema.bundles).where(eq(schema.bundles.id, id));
  await persistNow();
}

export async function getAllBundles(db: Db) {
  return db.select().from(schema.bundles).orderBy(asc(schema.bundles.title));
}

export async function getBundleById(db: Db, id: number) {
  const [bundle] = await db
    .select()
    .from(schema.bundles)
    .where(eq(schema.bundles.id, id))
    .limit(1);
  return bundle ?? null;
}

export async function addCardsToBundle(
  db: Db,
  bundleId: number,
  cardIds: number[],
) {
  // Get current max order
  const rows = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${schema.bundleCards.order}), -1)` })
    .from(schema.bundleCards)
    .where(eq(schema.bundleCards.bundleId, bundleId));
  let nextOrder = (rows[0]?.maxOrder ?? -1) + 1;

  await db.insert(schema.bundleCards).values(
    cardIds.map((cardId) => ({ cardId, bundleId, order: nextOrder++ })),
  );
}

export async function removeCardFromBundle(db: Db, bundleId: number, cardId: number) {
  await db
    .delete(schema.bundleCards)
    .where(
      and(
        eq(schema.bundleCards.bundleId, bundleId),
        eq(schema.bundleCards.cardId, cardId),
      ),
    );
}

export async function reorderBundleCard(
  db: Db,
  bundleId: number,
  cardId: number,
  newOrder: number,
) {
  await db
    .update(schema.bundleCards)
    .set({ order: newOrder })
    .where(
      and(
        eq(schema.bundleCards.bundleId, bundleId),
        eq(schema.bundleCards.cardId, cardId),
      ),
    );
}

export async function getBundleExamStats(db: Db, bundleId: number) {
  const bundleExams = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId))
    .orderBy(asc(schema.exams.createdAt));

  if (bundleExams.length === 0) {
    return {
      exams: [],
      attempts: [],
      totalAttempts: 0,
      completedAttempts: 0,
      avgScore: 0,
      bestScore: 0,
      worstScore: 0,
      totalTimeSeconds: 0,
    };
  }

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(asc(schema.examAttempts.startedAt));

  const completed = attempts.filter((a) => a.attempt.completedAt != null);

  // All scores: unfinished attempts count as 0
  const allScores = attempts.map((a) => (a.attempt.completedAt != null ? (a.attempt.score ?? 0) : 0));

  const totalTimeSeconds = completed.reduce((sum, a) => {
    if (!a.attempt.completedAt || !a.attempt.startedAt) return sum;
    return sum + Math.round((a.attempt.completedAt - a.attempt.startedAt) / 1000);
  }, 0);

  return {
    exams: bundleExams,
    attempts,
    totalAttempts: attempts.length,
    completedAttempts: completed.length,
    avgScore: allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0,
    bestScore: allScores.length > 0 ? Math.max(...allScores) : 0,
    worstScore: allScores.length > 0 ? Math.min(...allScores) : 0,
    totalTimeSeconds,
  };
}

export async function getBundlePastAttempts(db: Db, bundleId: number) {
  const bundleExams = await db
    .select({ id: schema.exams.id })
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId));

  if (bundleExams.length === 0) return [];

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(sql`${schema.examAttempts.startedAt} DESC`);

  return attempts;
}

export async function getBundleCardWeakness(db: Db, bundleId: number) {
  const cardsInBundle = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, bundleId));

  if (cardsInBundle.length === 0) return [];

  const cardIds = cardsInBundle.map((r) => r.cards.id);

  // Total graded answers per card (exclude ungraded / open answers where isCorrect is NULL)
  const totalAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      total: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        sql`${schema.examAnswers.isCorrect} IS NOT NULL`,
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  // Incorrect answers per card
  const incorrectAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      incorrect: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        eq(schema.examAnswers.isCorrect, false),
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  const totalMap = new Map(totalAnswers.map((r) => [r.cardId, r.total]));
  const incorrectMap = new Map(incorrectAnswers.map((r) => [r.cardId, r.incorrect]));
  const cardMap = new Map(cardsInBundle.map((r) => [r.cards.id, r.cards]));

  return cardsInBundle
    .map((r) => {
      const total = totalMap.get(r.cards.id) ?? 0;
      const incorrect = incorrectMap.get(r.cards.id) ?? 0;
      return {
        card: r.cards,
        total,
        incorrect,
        correct: total - incorrect,
        incorrectRate: total > 0 ? incorrect / total : 0,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.incorrectRate - a.incorrectRate);
}
