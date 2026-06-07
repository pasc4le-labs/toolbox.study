import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { importFullSnapshot, type SyncImportResult } from "@/lib/sync-import";
import type { FullSnapshot } from "@/lib/sync-serialize";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import { createCard, createTag, getAllCards, getAllTags, getAllBundles, getOrCreateTag } from "@/lib/services";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

function emptySnapshot(deviceId = "test-device"): FullSnapshot {
  return {
    version: 1,
    exportedAt: Date.now(),
    deviceId,
    cards: [],
    tags: [],
    cardTags: [],
    bundles: [],
    bundleCards: [],
    cardFsrs: [],
    reviewLogs: [],
    exams: [],
    examAttempts: [],
    examAnswers: [],
    examQuestions: [],
    todos: [],
  };
}

describe("sync-import", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  it("importing an empty snapshot into an empty DB — all counts are 0", async () => {
    const result = await importFullSnapshot(handle.db, emptySnapshot());
    expect(result.cardsImported).toBe(0);
    expect(result.cardsUpdated).toBe(0);
    expect(result.tagsImported).toBe(0);
    expect(result.bundlesImported).toBe(0);
  });

  it("importing cards with tags into an empty DB creates them", async () => {
    const snapshot = emptySnapshot();
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "What is gravity?",
      back: "A force",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    snapshot.tags = [{ id: 1, name: "physics" }];
    snapshot.cardTags = [{ cardId: 1, tagId: 1 }];

    const result = await importFullSnapshot(handle.db, snapshot);
    expect(result.cardsImported).toBe(1);
    expect(result.tagsImported).toBe(1);

    const cards = await getAllCards(handle.db);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("What is gravity?");

    const tags = await getAllTags(handle.db);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe("physics");
  });

  it("duplicate card detection — card with same front+type is updated (not duplicated)", async () => {
    // Create a local card first
    await createCard(handle.db, {
      type: "knowledge",
      front: "What is gravity?",
      back: "Old answer",
    });

    const snapshot = emptySnapshot();
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "What is gravity?",
      back: "New answer",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() + 10000, // newer
    }];

    const result = await importFullSnapshot(handle.db, snapshot);
    expect(result.cardsImported).toBe(0);
    expect(result.cardsUpdated).toBe(1);

    const cards = await getAllCards(handle.db);
    expect(cards).toHaveLength(1);
    expect(cards[0].back).toBe("New answer");
  });

  it("card update with older updatedAt — skipped (local data wins)", async () => {
    const localCard = await createCard(handle.db, {
      type: "knowledge",
      front: "What is gravity?",
      back: "Local answer",
    });

    const snapshot = emptySnapshot();
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "What is gravity?",
      back: "Older answer",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: Date.now() - 10000,
      updatedAt: localCard.updatedAt - 10000, // older
    }];

    const result = await importFullSnapshot(handle.db, snapshot);
    expect(result.cardsUpdated).toBe(0);

    const cards = await getAllCards(handle.db);
    expect(cards[0].back).toBe("Local answer");
  });

  it("bundle import creates new bundles with correct card references", async () => {
    const snapshot = emptySnapshot();
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "Card 1",
      back: "A1",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    snapshot.bundles = [{
      id: 1,
      title: "Test Bundle",
      description: null,
      emoji: null,
      coverColor: null,
      examQuestionCount: null,
      examTimeLimitSeconds: null,
      examDifficultyFilter: null,
      examPointsPerCorrect: null,
      examPointsPerWrong: null,
      createdAt: Date.now(),
    }];
    snapshot.bundleCards = [{ cardId: 1, bundleId: 1, order: 0 }];

    const result = await importFullSnapshot(handle.db, snapshot);
    expect(result.cardsImported).toBe(1);
    expect(result.bundlesImported).toBe(1);

    const bundles = await getAllBundles(handle.db);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].title).toBe("Test Bundle");
  });

  it("tag dedup — getOrCreateTag reuses existing tags", async () => {
    await getOrCreateTag(handle.db, "physics");

    const snapshot = emptySnapshot();
    snapshot.tags = [{ id: 1, name: "physics" }];

    const result = await importFullSnapshot(handle.db, snapshot);

    const tags = await getAllTags(handle.db);
    expect(tags).toHaveLength(1);
  });

  it("card_fsrs update — updates FSRS state for existing cards", async () => {
    const card = await createCard(handle.db, {
      type: "knowledge",
      front: "Test",
      back: "Test",
    });

    const snapshot = emptySnapshot();
    snapshot.cardFsrs = [{
      cardId: 1,
      difficulty: 0.5,
      stability: 10,
      state: 2,
      due: Date.now() + 86400000,
      elapsedDays: 5,
      scheduledDays: 10,
      reps: 5,
      lapses: 1,
      lastReview: Date.now(),
      learningSteps: 0,
    }];

    // card 1 should be mapped to card.id via cardIdMap
    // But the card was created with id=1 in the test DB, so it should match
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "Test",
      back: "Test",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }];

    const result = await importFullSnapshot(handle.db, snapshot);
    expect(result.cardFsrsUpdated).toBe(1);

    const fsrs = await handle.db
      .select()
      .from(schema.cardFsrs)
      .where(eq(schema.cardFsrs.cardId, card.id))
      .limit(1);

    expect(fsrs[0].reps).toBe(5);
  });

  it("review_logs import — appends without duplicates", async () => {
    const card = await createCard(handle.db, {
      type: "knowledge",
      front: "Test",
      back: "Test",
    });

    const reviewTimestamp = Date.now();

    const snapshot = emptySnapshot();
    snapshot.cards = [{
      id: 1,
      type: "knowledge",
      front: "Test",
      back: "Test",
      explanation: null,
      options: null,
      correctIndices: null,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }];
    snapshot.reviewLogs = [
      {
        id: 1,
        cardId: 1,
        rating: 3,
        state: 2,
        due: Date.now(),
        stability: 10,
        difficulty: 0.5,
        elapsedDays: 5,
        lastElapsedDays: 3,
        scheduledDays: 10,
        review: reviewTimestamp,
        learningSteps: 0,
      },
    ];

    // Import once
    await importFullSnapshot(handle.db, snapshot);
    // Import again (should not duplicate)
    await importFullSnapshot(handle.db, snapshot);

    const logs = await handle.db
      .select()
      .from(schema.reviewLogs);

    expect(logs).toHaveLength(1);
  });

  it("invalid snapshot version throws an error", async () => {
    const snapshot = { ...emptySnapshot(), version: 2 as 1 };
    await expect(importFullSnapshot(handle.db, snapshot)).rejects.toThrow(
      "Unsupported snapshot version: 2",
    );
  });
});
