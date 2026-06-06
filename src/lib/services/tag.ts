import { eq, sql, asc } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { persistNow } from '@/db';
import type { Db } from './types';

export async function createTag(db: Db, name: string) {
  const [tag] = await db.insert(schema.tags).values({ name }).returning();
  if (tag) await persistNow();
  return tag ?? null;
}

export async function getOrCreateTag(db: Db, name: string) {
  const [existing] = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.name, name))
    .limit(1);
  if (existing) return existing;
  return createTag(db, name);
}

export async function getAllTags(db: Db) {
  return db.select().from(schema.tags).orderBy(asc(schema.tags.name));
}

export async function deleteTag(db: Db, id: number) {
  await db.delete(schema.tags).where(eq(schema.tags.id, id));
  await persistNow();
}

export async function getTagStats(db: Db) {
  const rows = await db
    .select({
      tagId: schema.cardTags.tagId,
      tagName: schema.tags.name,
      cardCount: sql<number>`COUNT(*)`,
      avgStability: sql<number | null>`AVG(${schema.cardFsrs.stability})`,
      stateNew: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 0 THEN 1 ELSE 0 END)`,
      stateLearning: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 1 THEN 1 ELSE 0 END)`,
      stateReview: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 2 THEN 1 ELSE 0 END)`,
      stateRelearning: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 3 THEN 1 ELSE 0 END)`,
    })
    .from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .innerJoin(schema.cardFsrs, eq(schema.cardTags.cardId, schema.cardFsrs.cardId))
    .groupBy(schema.cardTags.tagId, schema.tags.name)
    .orderBy(asc(schema.tags.name));

  return rows;
}
