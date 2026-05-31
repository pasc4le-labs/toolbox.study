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
  items: Array<{ kind: "card" | "bundle" | "exam"; id: number }>,
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
    examQuestionCount: number | null;
    examTimeLimitSeconds: number | null;
    examDifficultyFilter: number | null;
    examPointsPerCorrect: number | null;
    examPointsPerWrong: number | null;
  }>;
  exams: Array<{
    id: number;
    title: string;
    bundleId: number | null;
    questionCount: number;
    timeLimitSeconds: number | null;
    difficultyFilter: number | null;
    pointsPerCorrect: number;
    pointsPerWrong: number;
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
      examQuestionCount: number | null;
      examTimeLimitSeconds: number | null;
      examDifficultyFilter: number | null;
      examPointsPerCorrect: number | null;
      examPointsPerWrong: number | null;
    }>,
    exams: [] as Array<{
      id: number;
      title: string;
      bundleId: number | null;
      questionCount: number;
      timeLimitSeconds: number | null;
      difficultyFilter: number | null;
      pointsPerCorrect: number;
      pointsPerWrong: number;
    }>,
  };

  const cardIds = new Set(items.filter(i => i.kind === "card").map(i => i.id));
  const bundleIds = new Set(items.filter(i => i.kind === "bundle").map(i => i.id));
  const examIds = new Set(items.filter(i => i.kind === "exam").map(i => i.id));

  console.log("[exchange/serialize] Input items:", items);
  console.log("[exchange/serialize] Discovered IDs — cards:", Array.from(cardIds), "bundles:", Array.from(bundleIds), "exams:", Array.from(examIds));

  // Auto-include cards from selected bundles so bundles arrive with their cards
  if (bundleIds.size > 0) {
    const bundleCardRows = await db
      .select({ cardId: schema.bundleCards.cardId })
      .from(schema.bundleCards)
      .where(inArray(schema.bundleCards.bundleId, Array.from(bundleIds)));
    console.log("[exchange/serialize] Bundle card rows from DB:", bundleCardRows);
    for (const row of bundleCardRows) {
      cardIds.add(row.cardId);
    }
  }

  console.log("[exchange/serialize] After auto-include, cardIds:", Array.from(cardIds));

  const allCards = cardIds.size > 0
    ? await db.select().from(schema.cards).where(inArray(schema.cards.id, Array.from(cardIds)))
    : [];
  const allBundles = bundleIds.size > 0
    ? await db.select().from(schema.bundles).where(inArray(schema.bundles.id, Array.from(bundleIds)))
    : [];
  const allExams = examIds.size > 0
    ? await db.select().from(schema.exams).where(inArray(schema.exams.id, Array.from(examIds)))
    : [];

  console.log("[exchange/serialize] DB results — cards:", allCards.length, "bundles:", allBundles.length, "exams:", allExams.length);

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
      examQuestionCount: bundle.examQuestionCount,
      examTimeLimitSeconds: bundle.examTimeLimitSeconds,
      examDifficultyFilter: bundle.examDifficultyFilter,
      examPointsPerCorrect: bundle.examPointsPerCorrect,
      examPointsPerWrong: bundle.examPointsPerWrong,
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
      pointsPerCorrect: exam.pointsPerCorrect,
      pointsPerWrong: exam.pointsPerWrong,
    });
  }

  return result;
}
