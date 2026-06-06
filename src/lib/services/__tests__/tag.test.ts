import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import {
  createTag,
  getOrCreateTag,
  getAllTags,
  deleteTag,
  getTagStats,
} from "@/lib/services/tag";
import { createCard } from "@/lib/services/card";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";

describe("tag service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("createTag", () => {
    it("creates a tag and returns it with id", async () => {
      const tag = await createTag(handle.db, "biology");
      expect(tag?.id).toBeGreaterThan(0);
      expect(tag?.name).toBe("biology");
    });

    it("throws on duplicate name (unique constraint)", async () => {
      await createTag(handle.db, "biology");
      await expect(createTag(handle.db, "biology")).rejects.toThrow();
    });
  });

  describe("getOrCreateTag", () => {
    it("creates tag on first call", async () => {
      const tag = await getOrCreateTag(handle.db, "math");
      expect(tag.name).toBe("math");
      expect(tag.id).toBeGreaterThan(0);
    });

    it("returns existing tag on second call", async () => {
      const first = await getOrCreateTag(handle.db, "math");
      const second = await getOrCreateTag(handle.db, "math");
      expect(second.id).toBe(first.id);
    });

    it("treats names case-sensitively by default", async () => {
      const a = await getOrCreateTag(handle.db, "Math");
      const b = await getOrCreateTag(handle.db, "math");
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("getAllTags", () => {
    it("returns tags ordered by name ascending", async () => {
      await createTag(handle.db, "zebra");
      await createTag(handle.db, "alpha");
      await createTag(handle.db, "mango");

      const all = await getAllTags(handle.db);
      expect(all.map((t) => t.name)).toEqual(["alpha", "mango", "zebra"]);
    });

    it("returns empty array when no tags", async () => {
      const all = await getAllTags(handle.db);
      expect(all).toEqual([]);
    });
  });

  describe("deleteTag", () => {
    it("removes the tag", async () => {
      const tag = await createTag(handle.db, "to-delete");
      await deleteTag(handle.db, tag.id);
      const all = await getAllTags(handle.db);
      expect(all).toEqual([]);
    });
  });

  describe("getTagStats", () => {
    it("returns empty array when no tags exist", async () => {
      const stats = await getTagStats(handle.db);
      expect(stats).toEqual([]);
    });

    it("returns aggregated stats with cardCount and avgStability", async () => {
      const tag = await createTag(handle.db, "bio");
      await createCard(handle.db, {
        type: "knowledge",
        front: "Q1",
        back: "A1",
        tagIds: [tag.id],
      });
      await createCard(handle.db, {
        type: "knowledge",
        front: "Q2",
        back: "A2",
        tagIds: [tag.id],
      });

      const stats = await getTagStats(handle.db);
      expect(stats).toHaveLength(1);
      expect(stats[0]?.tagName).toBe("bio");
      expect(stats[0]?.cardCount).toBe(2);
      expect(typeof stats[0]?.avgStability).toBe("number");
    });

    it("returns state breakdowns (New/Learning/Review/Relearning)", async () => {
      const tag = await createTag(handle.db, "topic");
      await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        tagIds: [tag.id],
      });

      const stats = await getTagStats(handle.db);
      const row = stats[0]!;
      // New state = 0
      expect(row.stateNew).toBe(1);
      expect(row.stateLearning).toBe(0);
      expect(row.stateReview).toBe(0);
      expect(row.stateRelearning).toBe(0);
    });
  });
});
