import type { SQLJsDatabase } from "drizzle-orm/sql-js";
import { eq, inArray, asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ManifestItem } from "./exchange-protocol";

type Db = SQLJsDatabase<typeof schema>;

export async function buildManifest(
  db: Db,
  selectedIds: { cards?: number[]; bundles?: number[]; exams?: number[] },
): Promise<ManifestItem[]> {
  const items: ManifestItem[] = [];

  if (selectedIds.cards && selectedIds.cards.length > 0) {
    const cards = await db
      .select()
      .from(schema.cards)
      .where(inArray(schema.cards.id, selectedIds.cards))
      .orderBy(asc(schema.cards.id));

    for (const card of cards) {
      items.push({
        kind: "card",
        id: card.id,
        displayName: card.front.slice(0, 60),
        meta: {
          type: card.type,
          hasExplanation: !!card.explanation,
        },
      });
    }
  }

  if (selectedIds.bundles && selectedIds.bundles.length > 0) {
    const bundles = await db
      .select()
      .from(schema.bundles)
      .where(inArray(schema.bundles.id, selectedIds.bundles))
      .orderBy(asc(schema.bundles.id));

    for (const bundle of bundles) {
      const count = await db
        .select()
        .from(schema.bundleCards)
        .where(eq(schema.bundleCards.bundleId, bundle.id));

      items.push({
        kind: "bundle",
        id: bundle.id,
        displayName: bundle.title.slice(0, 60),
        meta: {
          cardCount: count.length,
        },
      });
    }
  }

  if (selectedIds.exams && selectedIds.exams.length > 0) {
    const exams = await db
      .select()
      .from(schema.exams)
      .where(inArray(schema.exams.id, selectedIds.exams))
      .orderBy(asc(schema.exams.id));

    for (const exam of exams) {
      items.push({
        kind: "exam",
        id: exam.id,
        displayName: exam.title.slice(0, 60),
        meta: {
          questionCount: exam.questionCount,
          hasTimer: !!exam.timeLimitSeconds,
        },
      });
    }
  }

  return items;
}

export async function serializeSelectedItems(
  db: Db,
  ids: number[],
): Promise<{
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
}> {
  const result = {
    cards: [] as Array<{
      id: number;
      type: string;
      front: string;
      back: string;
      explanation: string | null;
      options: string | null;
      correctIndices: string | null;
      tagNames: string[];
    }>,
    bundles: [] as Array<{
      id: number;
      title: string;
      description: string | null;
      cardIds: number[];
    }>,
    exams: [] as Array<{
      id: number;
      title: string;
      bundleId: number | null;
      questionCount: number;
      timeLimitSeconds: number | null;
      difficultyFilter: number | null;
    }>,
  };

  // Fetch all selected items by kind
  const allCards = await db
    .select()
    .from(schema.cards)
    .where(inArray(schema.cards.id, ids));
  const allBundles = await db
    .select()
    .from(schema.bundles)
    .where(inArray(schema.bundles.id, ids));
  const allExams = await db
    .select()
    .from(schema.exams)
    .where(inArray(schema.exams.id, ids));

  // Cards
  for (const card of allCards) {
    const tags = await db
      .select({ name: schema.tags.name })
      .from(schema.cardTags)
      .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
      .where(eq(schema.cardTags.cardId, card.id));

    result.cards.push({
      id: card.id,
      type: card.type,
      front: card.front,
      back: card.back,
      explanation: card.explanation,
      options: card.options,
      correctIndices: card.correctIndices,
      tagNames: tags.map((t) => t.name),
    });
  }

  // Bundles — include ALL their cards, even ones not in the selected ids
  for (const bundle of allBundles) {
    const bc = await db
      .select({ cardId: schema.bundleCards.cardId })
      .from(schema.bundleCards)
      .where(eq(schema.bundleCards.bundleId, bundle.id))
      .orderBy(asc(schema.bundleCards.order));

    result.bundles.push({
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      cardIds: bc.map((r) => r.cardId),
    });
  }

  // Exams
  for (const exam of allExams) {
    result.exams.push({
      id: exam.id,
      title: exam.title,
      bundleId: exam.bundleId,
      questionCount: exam.questionCount,
      timeLimitSeconds: exam.timeLimitSeconds,
      difficultyFilter: exam.difficultyFilter,
    });
  }

  return result;
}
