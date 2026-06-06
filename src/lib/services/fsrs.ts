import { eq, lte, asc } from 'drizzle-orm';
import { createEmptyCard, fsrs, Rating, type Grade } from 'ts-fsrs';
import * as schema from '@/db/schema';
import type { Db } from './types';

export async function getOrCreateCardFsrs(db: Db, cardId: number) {
  const [existing] = await db
    .select()
    .from(schema.cardFsrs)
    .where(eq(schema.cardFsrs.cardId, cardId))
    .limit(1);
  if (existing) return existing;

  const emptyFsrs = createEmptyCard(new Date());
  const [created] = await db
    .insert(schema.cardFsrs)
    .values({
      cardId,
      difficulty: emptyFsrs.difficulty,
      stability: emptyFsrs.stability,
      state: emptyFsrs.state,
      due: emptyFsrs.due.getTime(),
      elapsedDays: emptyFsrs.elapsed_days,
      scheduledDays: emptyFsrs.scheduled_days,
      reps: emptyFsrs.reps,
      lapses: emptyFsrs.lapses,
      lastReview: emptyFsrs.last_review?.getTime() ?? null,
      learningSteps: emptyFsrs.learning_steps ?? 0,
    })
    .returning();
  return created!;
}

export async function rateCard(
  db: Db,
  cardId: number,
  rating: Rating,
  reviewTime?: Date,
) {
  const now = reviewTime ?? new Date();
  const fsrsState = await getOrCreateCardFsrs(db, cardId);
  const scheduler = fsrs();

  const { card: updatedCard, log } = scheduler.next(
    {
      difficulty: fsrsState.difficulty,
      stability: fsrsState.stability,
      state: fsrsState.state as 0 | 1 | 2 | 3,
      due: new Date(fsrsState.due),
      elapsed_days: fsrsState.elapsedDays,
      scheduled_days: fsrsState.scheduledDays,
      reps: fsrsState.reps,
      lapses: fsrsState.lapses,
      last_review: fsrsState.lastReview ? new Date(fsrsState.lastReview) : undefined,
      learning_steps: fsrsState.learningSteps,
    } as Parameters<typeof scheduler.next>[0],
    now,
    rating as Grade,
  );

  // Update card_fsrs
  await db
    .update(schema.cardFsrs)
    .set({
      difficulty: updatedCard.difficulty,
      stability: updatedCard.stability,
      state: updatedCard.state,
      due: updatedCard.due.getTime(),
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: updatedCard.scheduled_days,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
      lastReview: updatedCard.last_review?.getTime() ?? null,
      learningSteps: updatedCard.learning_steps ?? 0,
    })
    .where(eq(schema.cardFsrs.cardId, cardId));

  // Insert review log
  await db.insert(schema.reviewLogs).values({
    cardId,
    rating,
    state: updatedCard.state,
    due: updatedCard.due.getTime(),
    stability: updatedCard.stability,
    difficulty: updatedCard.difficulty,
    elapsedDays: updatedCard.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: updatedCard.scheduled_days,
    review: now.getTime(),
    learningSteps: updatedCard.learning_steps ?? 0,
  });

  return { card: updatedCard, log };
}

export async function getDueCards(
  db: Db,
  options?: { tagId?: number; bundleId?: number },
) {
  const now = Date.now();

  // Base query: cards with FSRS due <= now
  let query = db
    .select()
    .from(schema.cards)
    .innerJoin(schema.cardFsrs, eq(schema.cards.id, schema.cardFsrs.cardId))
    .where(lte(schema.cardFsrs.due, now))
    .orderBy(asc(schema.cardFsrs.due));

  let results = await query;

  if (options?.tagId) {
    const taggedCardIds = await db
      .select({ cardId: schema.cardTags.cardId })
      .from(schema.cardTags)
      .where(eq(schema.cardTags.tagId, options.tagId));
    const ids = new Set(taggedCardIds.map((r) => r.cardId));
    results = results.filter((r) => ids.has(r.cards.id));
  }

  if (options?.bundleId) {
    const bundleCardIds = await db
      .select({ cardId: schema.bundleCards.cardId })
      .from(schema.bundleCards)
      .where(eq(schema.bundleCards.bundleId, options.bundleId));
    const ids = new Set(bundleCardIds.map((r) => r.cardId));
    results = results.filter((r) => ids.has(r.cards.id));
  }

  return results;
}
