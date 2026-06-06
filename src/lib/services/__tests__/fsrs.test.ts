import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { Rating } from "ts-fsrs";
import {
  getOrCreateCardFsrs,
  rateCard,
  getDueCards,
} from "@/lib/services/fsrs";
import { createCard } from "@/lib/services/card";
import { createTag } from "@/lib/services/tag";
import { createBundle, addCardsToBundle } from "@/lib/services/bundle";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("FSRS service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("getOrCreateCardFsrs", () => {
    it("creates a new FSRS entry for a new card", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });

      const fsrs = await getOrCreateCardFsrs(handle.db, card.id);
      expect(fsrs.cardId).toBe(card.id);
      expect(fsrs.state).toBe(0); // New
      expect(fsrs.reps).toBe(0);
      expect(fsrs.lapses).toBe(0);
      // createEmptyCard returns difficulty=0, stability=0 (per ts-fsrs)
      expect(fsrs.difficulty).toBe(0);
      expect(fsrs.stability).toBe(0);
    });

    it("returns existing FSRS entry on second call", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const a = await getOrCreateCardFsrs(handle.db, card.id);
      const b = await getOrCreateCardFsrs(handle.db, card.id);
      expect(a.cardId).toBe(b.cardId);
      expect(a.state).toBe(b.state);
    });
  });

  describe("rateCard", () => {
    it("Rating.Good: increments reps and moves state out of New", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });

      const { card: updated } = await rateCard(handle.db, card.id, Rating.Good);
      expect(updated.reps).toBe(1);
      expect(updated.state).not.toBe(0);

      // Review log was inserted
      const logs = await handle.db
        .select()
        .from(schema.reviewLogs)
        .where(eq(schema.reviewLogs.cardId, card.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.rating).toBe(Rating.Good);
    });

    it("Rating.Again on a New card: lapses stays 0 (FSRS only increments lapses from Review state)", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const { card: updated } = await rateCard(handle.db, card.id, Rating.Again);
      // New card + Again: enters Learning (state=1) with lapses unchanged
      expect(updated.lapses).toBe(0);
      expect(updated.state).toBe(1);
    });

    it("Rating.Again on a Review card: increments lapses", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      // First rate as Good twice to move into Review state (state=2)
      await rateCard(handle.db, card.id, Rating.Good);
      await rateCard(handle.db, card.id, Rating.Good);
      // Then rate as Again to lapse
      const { card: updated } = await rateCard(handle.db, card.id, Rating.Again);
      expect(updated.lapses).toBe(1);
      expect(updated.state).toBe(3); // Relearning
    });

    it("Rating.Easy on a new card: sets stability and scheduledDays", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const { card: updated } = await rateCard(handle.db, card.id, Rating.Easy);
      // ts-fsrs returns the Card object with snake_case field names
      expect(updated.stability).toBeGreaterThan(0);
      expect(updated.scheduled_days).toBeGreaterThan(0);
    });

    it("Rating.Hard on a new card: increments reps", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const { card: updated } = await rateCard(handle.db, card.id, Rating.Hard);
      expect(updated.reps).toBe(1);
    });

    it("accepts a custom reviewTime parameter", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const customTime = new Date("2030-01-01T00:00:00Z");
      const { card: updated } = await rateCard(
        handle.db,
        card.id,
        Rating.Good,
        customTime,
      );
      // due should be after reviewTime
      expect(updated.due.getTime()).toBeGreaterThanOrEqual(customTime.getTime());
    });

    it("accumulates reps across multiple ratings", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      await rateCard(handle.db, card.id, Rating.Good);
      await rateCard(handle.db, card.id, Rating.Good);
      const { card: updated } = await rateCard(handle.db, card.id, Rating.Good);
      expect(updated.reps).toBe(3);
    });
  });

  describe("getDueCards", () => {
    it("returns cards with due <= now (newly created cards are due)", async () => {
      await createCard(handle.db, { type: "knowledge", front: "Q1", back: "A" });
      await createCard(handle.db, { type: "knowledge", front: "Q2", back: "A" });

      const due = await getDueCards(handle.db);
      expect(due).toHaveLength(2);
    });

    it("returns empty array when no cards exist", async () => {
      const due = await getDueCards(handle.db);
      expect(due).toEqual([]);
    });

    it("filters by tagId when provided", async () => {
      const tag = await createTag(handle.db, "math");
      await createCard(handle.db, { type: "knowledge", front: "with-tag", back: "A", tagIds: [tag.id] });
      await createCard(handle.db, { type: "knowledge", front: "no-tag", back: "A" });

      const due = await getDueCards(handle.db, { tagId: tag.id });
      expect(due).toHaveLength(1);
      expect(due[0]?.cards.front).toBe("with-tag");
    });

    it("filters by bundleId when provided", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c1 = await createCard(handle.db, { type: "knowledge", front: "in-bundle", back: "A" });
      await addCardsToBundle(handle.db, bundle.id, [c1.id]);
      await createCard(handle.db, { type: "knowledge", front: "out-of-bundle", back: "A" });

      const due = await getDueCards(handle.db, { bundleId: bundle.id });
      expect(due).toHaveLength(1);
      expect(due[0]?.cards.front).toBe("in-bundle");
    });

    it("excludes cards whose due is in the future", async () => {
      const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
      // Manually push due into the future
      const farFuture = Date.now() + 1000 * 60 * 60 * 24; // +1 day
      await handle.db
        .update(schema.cardFsrs)
        .set({ due: farFuture })
        .where(eq(schema.cardFsrs.cardId, card.id));

      const due = await getDueCards(handle.db);
      expect(due).toHaveLength(0);
    });
  });
});
