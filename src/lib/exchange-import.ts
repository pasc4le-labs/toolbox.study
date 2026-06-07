import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createCard, createBundle, getOrCreateTag } from "@/lib/services";
import type { Db } from "@/lib/services/types";
import { persistNow } from "@/db";

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
      examQuestionCount?: number | null;
      examTimeLimitSeconds?: number | null;
      examDifficultyFilter?: number | null;
      examPointsPerCorrect?: number | null;
      examPointsPerWrong?: number | null;
    }>;
    exams: Array<{
      id: number;
      title: string;
      bundleId: number | null;
      questionCount: number;
      timeLimitSeconds: number | null;
      difficultyFilter: number | null;
      pointsPerCorrect?: number;
      pointsPerWrong?: number;
    }>;
  },
): Promise<{ cards: number; bundles: number; exams: number }> {
  const cardIdMap = new Map<number, number>(); // oldId -> newId
  let cardsImported = 0;
  let bundlesImported = 0;
  let examsImported = 0;
  let cardsSkipped = 0;

  console.log("[exchange/import] Starting import. Input data:", {
    cards: data.cards.length,
    bundles: data.bundles.length,
    exams: data.exams.length,
    cardPreviews: data.cards.map(c => ({ id: c.id, front: c.front.slice(0, 40), type: c.type })),
    bundlePreviews: data.bundles.map(b => ({ id: b.id, title: b.title, cardIds: b.cardIds })),
    examPreviews: data.exams.map(e => ({ id: e.id, title: e.title, bundleId: e.bundleId })),
  });

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
      console.log(`[exchange/import] Card duplicate detected: id=${cardData.id} front="${cardData.front.slice(0, 30)}" → mapping to existing id=${existing[0].id}`);
      cardIdMap.set(cardData.id, existing[0].id);
      cardsSkipped++;
      continue;
    }

    const tagIds: number[] = [];
    for (const tagName of cardData.tagNames) {
      const tag = await getOrCreateTag(db, tagName);
      tagIds.push(tag.id);
    }

    const newCard = await createCard(db, {
      type: cardData.type as "multi_radio" | "multi_select" | "open" | "knowledge",
      front: cardData.front,
      back: cardData.back,
      explanation: cardData.explanation,
      options: cardData.options ? JSON.parse(cardData.options) : null,
      correctIndices: cardData.correctIndices
        ? JSON.parse(cardData.correctIndices)
        : null,
      tagIds,
    });

    console.log(`[exchange/import] Card created: oldId=${cardData.id} → newId=${newCard.id} front="${cardData.front.slice(0, 30)}"`);
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

    // Set exam settings on the bundle
    if (bundleData.examQuestionCount != null || bundleData.examTimeLimitSeconds != null ||
        bundleData.examDifficultyFilter != null || bundleData.examPointsPerCorrect != null ||
        bundleData.examPointsPerWrong != null) {
      const { updateBundle } = await import("@/lib/services");
      await updateBundle(db, newBundle.id, {
        examQuestionCount: bundleData.examQuestionCount ?? null,
        examTimeLimitSeconds: bundleData.examTimeLimitSeconds ?? null,
        examDifficultyFilter: bundleData.examDifficultyFilter ?? null,
        examPointsPerCorrect: bundleData.examPointsPerCorrect ?? null,
        examPointsPerWrong: bundleData.examPointsPerWrong ?? null,
      });
    }

    // Map old card IDs to new card IDs, deduplicating (duplicate cards can map
    // multiple old IDs to the same new ID, which would violate the composite
    // primary key on bundle_cards).
    const newCardIds = [...new Set(
      bundleData.cardIds
        .map((oldId) => cardIdMap.get(oldId))
        .filter((id): id is number => id !== undefined),
    )];

    console.log(`[exchange/import] Bundle "${bundleData.title}" (oldId=${bundleData.id} → newId=${newBundle.id}): cardIds=${JSON.stringify(bundleData.cardIds)} → mapped=${JSON.stringify(newCardIds)}`);

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
      pointsPerCorrect: examData.pointsPerCorrect ?? 1,
      pointsPerWrong: examData.pointsPerWrong ?? 0,
      createdAt: Date.now(),
    });
    examsImported++;
  }

  console.log(`[exchange/import] Import complete: ${cardsImported} cards imported (${cardsSkipped} duplicates skipped), ${bundlesImported} bundles, ${examsImported} exams`);
  console.log(`[exchange/import] cardIdMap:`, Object.fromEntries(cardIdMap));
  await persistNow();
  return { cards: cardsImported, bundles: bundlesImported, exams: examsImported };
}
