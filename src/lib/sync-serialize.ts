import * as schema from '@/db/schema';
import type { Db } from '@/lib/services/types';

export type FullSnapshot = {
  version: 1;
  exportedAt: number;
  deviceId: string;
  cards: (typeof schema.cards.$inferSelect)[];
  tags: (typeof schema.tags.$inferSelect)[];
  cardTags: (typeof schema.cardTags.$inferSelect)[];
  bundles: (typeof schema.bundles.$inferSelect)[];
  bundleCards: (typeof schema.bundleCards.$inferSelect)[];
  cardFsrs: (typeof schema.cardFsrs.$inferSelect)[];
  reviewLogs: (typeof schema.reviewLogs.$inferSelect)[];
  exams: (typeof schema.exams.$inferSelect)[];
  examAttempts: (typeof schema.examAttempts.$inferSelect)[];
  examAnswers: (typeof schema.examAnswers.$inferSelect)[];
  examQuestions: (typeof schema.examQuestions.$inferSelect)[];
  todos: (typeof schema.todos.$inferSelect)[];
};

export async function exportFullSnapshot(db: Db, deviceId: string): Promise<FullSnapshot> {
  const [
    cards, tags, cardTags, bundles, bundleCards,
    cardFsrs, reviewLogs, exams, examAttempts,
    examAnswers, examQuestions, todos,
  ] = await Promise.all([
    db.select().from(schema.cards).orderBy(schema.cards.id),
    db.select().from(schema.tags).orderBy(schema.tags.id),
    db.select().from(schema.cardTags),
    db.select().from(schema.bundles).orderBy(schema.bundles.id),
    db.select().from(schema.bundleCards),
    db.select().from(schema.cardFsrs).orderBy(schema.cardFsrs.cardId),
    db.select().from(schema.reviewLogs).orderBy(schema.reviewLogs.id),
    db.select().from(schema.exams).orderBy(schema.exams.id),
    db.select().from(schema.examAttempts).orderBy(schema.examAttempts.id),
    db.select().from(schema.examAnswers).orderBy(schema.examAnswers.id),
    db.select().from(schema.examQuestions).orderBy(schema.examQuestions.id),
    db.select().from(schema.todos).orderBy(schema.todos.id),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    deviceId,
    cards,
    tags,
    cardTags,
    bundles,
    bundleCards,
    cardFsrs,
    reviewLogs,
    exams,
    examAttempts,
    examAnswers,
    examQuestions,
    todos,
  };
}

export function countSnapshotRecords(snapshot: FullSnapshot): number {
  return snapshot.cards.length
    + snapshot.tags.length
    + snapshot.bundles.length
    + snapshot.exams.length
    + snapshot.reviewLogs.length
    + snapshot.examAttempts.length;
}
