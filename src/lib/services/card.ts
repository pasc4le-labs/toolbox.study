import { eq, inArray, sql, asc } from 'drizzle-orm';
import { createEmptyCard } from 'ts-fsrs';
import * as schema from '@/db/schema';
import { persistNow } from '@/db';
import type { Db } from './types';

export async function createCard(
  db: Db,
  data: {
    type: 'multi_radio' | 'multi_select' | 'open' | 'knowledge';
    front: string;
    back: string;
    explanation?: string | null;
    options?: string[] | null;
    correctIndices?: number[] | null;
    tagIds?: number[];
    bundleIds?: number[];
  },
) {
  const now = Date.now();
  const [card] = await db
    .insert(schema.cards)
    .values({
      type: data.type,
      front: data.front,
      back: data.back,
      explanation: data.explanation ?? null,
      options: data.options ? JSON.stringify(data.options) : null,
      correctIndices: data.correctIndices ? JSON.stringify(data.correctIndices) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!card) throw new Error('Failed to create card');

  // Create FSRS state
  const emptyFsrs = createEmptyCard(new Date(now));
  await db.insert(schema.cardFsrs).values({
    cardId: card.id,
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
  });

  // Tags
  if (data.tagIds && data.tagIds.length > 0) {
    await db.insert(schema.cardTags).values(
      data.tagIds.map((tagId) => ({ cardId: card.id, tagId })),
    );
  }

  // Bundles
  if (data.bundleIds && data.bundleIds.length > 0) {
    await db.insert(schema.bundleCards).values(
      data.bundleIds.map((bundleId) => ({
        cardId: card.id,
        bundleId,
        order: 0,
      })),
    );
  }

  await persistNow();
  return card;
}

export async function updateCard(
  db: Db,
  id: number,
  data: {
    front?: string;
    back?: string;
    explanation?: string | null;
    options?: string[] | null;
    correctIndices?: number[] | null;
    type?: 'multi_radio' | 'multi_select' | 'open' | 'knowledge';
    tagIds?: number[];
    bundleIds?: number[];
  },
) {
  const now = Date.now();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (data.front !== undefined) updateData.front = data.front;
  if (data.back !== undefined) updateData.back = data.back;
  if (data.explanation !== undefined) updateData.explanation = data.explanation;
  if (data.options !== undefined) updateData.options = data.options ? JSON.stringify(data.options) : null;
  if (data.correctIndices !== undefined) updateData.correctIndices = data.correctIndices ? JSON.stringify(data.correctIndices) : null;
  if (data.type !== undefined) updateData.type = data.type;

  await db.update(schema.cards).set(updateData).where(eq(schema.cards.id, id));

  if (data.tagIds !== undefined) {
    await db.delete(schema.cardTags).where(eq(schema.cardTags.cardId, id));
    if (data.tagIds.length > 0) {
      await db.insert(schema.cardTags).values(
        data.tagIds.map((tagId) => ({ cardId: id, tagId })),
      );
    }
  }

  if (data.bundleIds !== undefined) {
    await db.delete(schema.bundleCards).where(eq(schema.bundleCards.cardId, id));
    if (data.bundleIds.length > 0) {
      await db.insert(schema.bundleCards).values(
        data.bundleIds.map((bundleId) => ({ cardId: id, bundleId, order: 0 })),
      );
    }
  }
}

export async function deleteCard(db: Db, id: number) {
  await db.delete(schema.cards).where(eq(schema.cards.id, id));
  await persistNow();
}

export async function getCardById(db: Db, id: number) {
  const [card] = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .limit(1);
  return card ?? null;
}

export async function getAllCards(db: Db) {
  return db.select().from(schema.cards).orderBy(asc(schema.cards.createdAt));
}

export async function searchCards(db: Db, query: string) {
  return db
    .select()
    .from(schema.cards)
    .where(sql`${schema.cards.front} LIKE ${`%${query}%`}`)
    .orderBy(asc(schema.cards.createdAt));
}

export async function getUntaggedCardsByBundle(db: Db, bundleId: number) {
  // Get all card IDs in bundle
  const bundleCardRows = await db
    .select({
      cardId: schema.bundleCards.cardId,
      order: schema.bundleCards.order,
    })
    .from(schema.bundleCards)
    .where(eq(schema.bundleCards.bundleId, bundleId))
    .orderBy(asc(schema.bundleCards.order));

  if (bundleCardRows.length === 0) return [];

  const cardIds = bundleCardRows.map((r) => r.cardId);

  // Get all cardIds that already have at least one tag
  const taggedRows = await db
    .select({ cardId: schema.cardTags.cardId })
    .from(schema.cardTags)
    .where(inArray(schema.cardTags.cardId, cardIds));

  const taggedSet = new Set(taggedRows.map((r) => r.cardId));

  // Filter to untagged cards
  const untaggedIds = cardIds.filter((id) => !taggedSet.has(id));

  if (untaggedIds.length === 0) return [];

  // Fetch the full card data for untagged cards
  const untaggedCards = await db
    .select()
    .from(schema.cards)
    .where(inArray(schema.cards.id, untaggedIds))
    .orderBy(asc(schema.cards.createdAt));

  return untaggedCards;
}

export async function addTagsToCard(db: Db, cardId: number, tagIds: number[]) {
  if (tagIds.length === 0) return;
  await db.insert(schema.cardTags).values(
    tagIds.map((tagId) => ({ cardId, tagId })),
  );
  await persistNow();
}

export async function getCardsByTag(db: Db, tagId: number) {
  return db
    .select()
    .from(schema.cards)
    .innerJoin(schema.cardTags, eq(schema.cards.id, schema.cardTags.cardId))
    .where(eq(schema.cardTags.tagId, tagId))
    .orderBy(asc(schema.cards.createdAt));
}

export async function getCardsByBundle(db: Db, bundleId: number) {
  return db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, bundleId))
    .orderBy(asc(schema.bundleCards.order));
}

export async function getCardTags(db: Db, cardId: number) {
  return db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
    })
    .from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .where(eq(schema.cardTags.cardId, cardId));
}

export async function getCardBundles(db: Db, cardId: number) {
  return db
    .select({
      id: schema.bundles.id,
      title: schema.bundles.title,
    })
    .from(schema.bundleCards)
    .innerJoin(schema.bundles, eq(schema.bundleCards.bundleId, schema.bundles.id))
    .where(eq(schema.bundleCards.cardId, cardId));
}
