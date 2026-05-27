import type { SQLJsDatabase } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createCard, createBundle, getOrCreateTag } from "@/lib/db-queries";
import { persistNow } from "@/db";

type Db = SQLJsDatabase<typeof schema>;

export async function importExchangeData(
  db: Db,
  data: {
    cards: Array<{
      id: number;
      type: string;
      front: string;
      back: string;
      explanation: string | null;
      options: string | null;
      correctIndices: string | null;
      tagNames: string[];
    }>;
    bundles: Array<{
      id: number;
      title: string;
      description: string | null;
      cardIds: number[];
    }>;
    exams: Array<{
      id: number;
      title: string;
      bundleId: number | null;
      questionCount: number;
      timeLimitSeconds: number | null;
      difficultyFilter: number | null;
    }>;
  },
): Promise<{ cards: number; bundles: number; exams: number }> {
  const cardIdMap = new Map<number, number>(); // oldId -> newId
  let cardsImported = 0;
  let bundlesImported = 0;
  let examsImported = 0;

  // Import cards first
  for (const cardData of data.cards) {
    // Duplicate detection: check for same front + type
    const existing = await db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.front, cardData.front))
      .limit(1);
    if (existing.length > 0 && existing[0].type === cardData.type) {
      // Map old id to existing id for bundle/exam references
      cardIdMap.set(cardData.id, existing[0].id);
      continue;
    }

    const tagIds: number[] = [];
    for (const tagName of cardData.tagNames) {
      const tag = await getOrCreateTag(db, tagName);
      tagIds.push(tag.id);
    }

    const newCard = await createCard(db, {
      type: cardData.type as any,
      front: cardData.front,
      back: cardData.back,
      explanation: cardData.explanation,
      options: cardData.options ? JSON.parse(cardData.options) : null,
      correctIndices: cardData.correctIndices
        ? JSON.parse(cardData.correctIndices)
        : null,
      tagIds,
    });

    cardIdMap.set(cardData.id, newCard.id);
    cardsImported++;
  }

  // Import bundles
  const bundleIdMap = new Map<number, number>();
  for (const bundleData of data.bundles) {
    const newBundle = await createBundle(db, {
      title: bundleData.title,
      description: bundleData.description,
    });

    // Map old card IDs to new card IDs and add to bundle
    const newCardIds = bundleData.cardIds
      .map((oldId) => cardIdMap.get(oldId))
      .filter((id): id is number => id !== undefined);

    if (newCardIds.length > 0) {
      await db.insert(schema.bundleCards).values(
        newCardIds.map((cardId, idx) => ({
          cardId,
          bundleId: newBundle.id,
          order: idx,
        })),
      );
    }

    bundleIdMap.set(bundleData.id, newBundle.id);
    bundlesImported++;
  }

  // Import exams
  for (const examData of data.exams) {
    const newBundleId = examData.bundleId
      ? bundleIdMap.get(examData.bundleId) ?? null
      : null;

    await db.insert(schema.exams).values({
      title: examData.title,
      bundleId: newBundleId,
      questionCount: examData.questionCount,
      timeLimitSeconds: examData.timeLimitSeconds,
      difficultyFilter: examData.difficultyFilter,
      createdAt: Date.now(),
    });
    examsImported++;
  }

  await persistNow();
  return { cards: cardsImported, bundles: bundlesImported, exams: examsImported };
}
