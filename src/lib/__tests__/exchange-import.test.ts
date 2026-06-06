import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { importExchangeData } from "@/lib/exchange-import";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import { getAllCards, getAllTags, getAllBundles } from "@/lib/services";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

describe("exchange-import", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  it("imports cards and creates tags via getOrCreateTag", async () => {
    const result = await importExchangeData(handle.db, {
      cards: [
        {
          id: 1,
          type: "knowledge",
          front: "Q1",
          back: "A1",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: ["biology", "cells"],
        },
        {
          id: 2,
          type: "knowledge",
          front: "Q2",
          back: "A2",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: ["biology"],
        },
      ],
      bundles: [],
      exams: [],
    });

    expect(result.cards).toBe(2);

    const tags = await getAllTags(handle.db);
    // biology and cells
    expect(tags).toHaveLength(2);

    const cards = await getAllCards(handle.db);
    const card1 = cards.find((c) => c.front === "Q1");
    const card2 = cards.find((c) => c.front === "Q2");
    expect(card1).toBeDefined();
    expect(card2).toBeDefined();

    // Card 1 should have 2 tags, card 2 should have 1
    const card1Tags = await handle.db
      .select()
      .from(schema.cardTags)
      .where(eq(schema.cardTags.cardId, card1!.id));
    const card2Tags = await handle.db
      .select()
      .from(schema.cardTags)
      .where(eq(schema.cardTags.cardId, card2!.id));
    expect(card1Tags).toHaveLength(2);
    expect(card2Tags).toHaveLength(1);
  });

  it("detects duplicate cards (same front+type) and maps oldId to existing", async () => {
    await importExchangeData(handle.db, {
      cards: [
        {
          id: 1,
          type: "knowledge",
          front: "dup",
          back: "first",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: [],
        },
      ],
      bundles: [],
      exams: [],
    });

    const result = await importExchangeData(handle.db, {
      cards: [
        {
          id: 999, // different old id
          type: "knowledge",
          front: "dup",
          back: "second",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: [],
        },
      ],
      bundles: [],
      exams: [],
    });

    expect(result.cards).toBe(0);

    const cards = await getAllCards(handle.db);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.back).toBe("first");
  });

  it("imports bundles with their cards", async () => {
    const cardResult = await importExchangeData(handle.db, {
      cards: [
        {
          id: 1,
          type: "knowledge",
          front: "Q1",
          back: "A1",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: [],
        },
        {
          id: 2,
          type: "knowledge",
          front: "Q2",
          back: "A2",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: [],
        },
      ],
      bundles: [
        {
          id: 10,
          title: "Imported Bundle",
          description: "desc",
          cardIds: [1, 2],
        },
      ],
      exams: [],
    });

    expect(cardResult.bundles).toBe(1);

    const bundles = await getAllBundles(handle.db);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.title).toBe("Imported Bundle");
  });

  it("imports exams with bundle reference", async () => {
    const result = await importExchangeData(handle.db, {
      cards: [],
      bundles: [
        {
          id: 1,
          title: "B",
          description: null,
          cardIds: [],
        },
      ],
      exams: [
        {
          id: 100,
          title: "E1",
          bundleId: 1,
          questionCount: 5,
          timeLimitSeconds: 600,
          difficultyFilter: 0.3,
          pointsPerCorrect: 2,
          pointsPerWrong: -0.5,
        },
      ],
    });

    expect(result.exams).toBe(1);
    const exams = await handle.db.select().from(schema.exams);
    expect(exams[0]?.bundleId).toBeGreaterThan(0);
    expect(exams[0]?.timeLimitSeconds).toBe(600);
    expect(exams[0]?.difficultyFilter).toBe(0.3);
  });

  it("returns zeros for empty input arrays", async () => {
    const result = await importExchangeData(handle.db, {
      cards: [],
      bundles: [],
      exams: [],
    });
    expect(result).toEqual({ cards: 0, bundles: 0, exams: 0 });
  });

  it("parses options and correctIndices as JSON", async () => {
    const result = await importExchangeData(handle.db, {
      cards: [
        {
          id: 1,
          type: "multi_radio",
          front: "Q",
          back: "A",
          explanation: null,
          options: JSON.stringify(["a", "b", "c"]),
          correctIndices: JSON.stringify([1]),
          tagNames: [],
        },
      ],
      bundles: [],
      exams: [],
    });

    expect(result.cards).toBe(1);
    const cards = await getAllCards(handle.db);
    expect(cards[0]?.options).toBe(JSON.stringify(["a", "b", "c"]));
    expect(cards[0]?.correctIndices).toBe(JSON.stringify([1]));
  });

  it("handles null options/correctIndices", async () => {
    await importExchangeData(handle.db, {
      cards: [
        {
          id: 1,
          type: "knowledge",
          front: "Q",
          back: "A",
          explanation: null,
          options: null,
          correctIndices: null,
          tagNames: [],
        },
      ],
      bundles: [],
      exams: [],
    });

    const cards = await getAllCards(handle.db);
    expect(cards[0]?.options).toBeNull();
    expect(cards[0]?.correctIndices).toBeNull();
  });

  it("imports bundle exam settings when present", async () => {
    await importExchangeData(handle.db, {
      cards: [],
      bundles: [
        {
          id: 1,
          title: "B",
          description: null,
          cardIds: [],
          examQuestionCount: 15,
          examTimeLimitSeconds: 900,
          examDifficultyFilter: 0.7,
          examPointsPerCorrect: 3,
          examPointsPerWrong: -1,
        },
      ],
      exams: [],
    });

    const bundles = await getAllBundles(handle.db);
    expect(bundles[0]?.examQuestionCount).toBe(15);
    expect(bundles[0]?.examTimeLimitSeconds).toBe(900);
    expect(bundles[0]?.examDifficultyFilter).toBe(0.7);
    expect(bundles[0]?.examPointsPerCorrect).toBe(3);
    expect(bundles[0]?.examPointsPerWrong).toBe(-1);
  });
});
