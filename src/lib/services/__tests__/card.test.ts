import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock the persistNow at the @/db module boundary so we don't hit IndexedDB
vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import {
  createCard,
  updateCard,
  deleteCard,
  getCardById,
  getAllCards,
  searchCards,
  getUntaggedCardsByBundle,
  addTagsToCard,
  getCardsByTag,
  getCardsByBundle,
  getCardTags,
  getCardBundles,
} from "@/lib/services/card";
import { createTag } from "@/lib/services/tag";
import { createBundle } from "@/lib/services/bundle";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";

describe("card service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("createCard", () => {
    it("creates a knowledge card with correct fields and FSRS entry", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q1",
        back: "A1",
      });

      expect(card.id).toBeGreaterThan(0);
      expect(card.type).toBe("knowledge");
      expect(card.front).toBe("Q1");
      expect(card.back).toBe("A1");
      expect(card.options).toBeNull();
      expect(card.correctIndices).toBeNull();

      // FSRS entry should also exist
      const fsrs = await handle.db
        .select()
        .from(schema.cardFsrs)
        .where(eq(schema.cardFsrs.cardId, card.id));
      expect(fsrs).toHaveLength(1);
    });

    it("creates a multi_radio card with options, correctIndices, and tags", async () => {
      const tag = await createTag(handle.db, "math");
      const card = await createCard(handle.db, {
        type: "multi_radio",
        front: "2+2?",
        back: "4",
        options: ["3", "4", "5"],
        correctIndices: [1],
        tagIds: [tag.id],
      });

      expect(card.options).toBe(JSON.stringify(["3", "4", "5"]));
      expect(card.correctIndices).toBe(JSON.stringify([1]));

      const cardTags = await getCardTags(handle.db, card.id);
      expect(cardTags).toHaveLength(1);
      expect(cardTags[0]?.name).toBe("math");
    });

    it("creates a card and links to a bundle via bundleIds", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        bundleIds: [bundle.id],
      });

      const bundles = await getCardBundles(handle.db, card.id);
      expect(bundles).toHaveLength(1);
      expect(bundles[0]?.id).toBe(bundle.id);
    });
  });

  describe("getCardById", () => {
    it("returns the card when it exists", async () => {
      const created = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const fetched = await getCardById(handle.db, created.id);
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.front).toBe("Q");
    });

    it("returns null when card does not exist", async () => {
      const fetched = await getCardById(handle.db, 9999);
      expect(fetched).toBeNull();
    });
  });

  describe("getAllCards", () => {
    it("returns all cards ordered by createdAt ascending", async () => {
      const a = await createCard(handle.db, { type: "knowledge", front: "A", back: "a" });
      const b = await createCard(handle.db, { type: "knowledge", front: "B", back: "b" });
      const c = await createCard(handle.db, { type: "knowledge", front: "C", back: "c" });

      const all = await getAllCards(handle.db);
      expect(all.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    });

    it("returns empty array when no cards exist", async () => {
      const all = await getAllCards(handle.db);
      expect(all).toEqual([]);
    });
  });

  describe("updateCard", () => {
    it("updates specified fields and sets updatedAt", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const before = card.updatedAt;
      // Wait a millisecond so updatedAt is strictly later
      await new Promise((r) => setTimeout(r, 2));
      await updateCard(handle.db, card.id, { front: "Updated Q" });

      const updated = await getCardById(handle.db, card.id);
      expect(updated?.front).toBe("Updated Q");
      expect(updated?.updatedAt).toBeGreaterThan(before);
    });

    it("replaces card's tagIds when tagIds is provided", async () => {
      const tagA = await createTag(handle.db, "a");
      const tagB = await createTag(handle.db, "b");
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        tagIds: [tagA.id],
      });

      await updateCard(handle.db, card.id, { tagIds: [tagB.id] });

      const tags = await getCardTags(handle.db, card.id);
      expect(tags.map((t) => t.id)).toEqual([tagB.id]);
    });

    it("clears card's tags when tagIds is an empty array", async () => {
      const tag = await createTag(handle.db, "a");
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        tagIds: [tag.id],
      });

      await updateCard(handle.db, card.id, { tagIds: [] });

      const tags = await getCardTags(handle.db, card.id);
      expect(tags).toEqual([]);
    });

    it("replaces card's bundleIds when bundleIds is provided", async () => {
      const b1 = await createBundle(handle.db, { title: "b1" });
      const b2 = await createBundle(handle.db, { title: "b2" });
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        bundleIds: [b1.id],
      });

      await updateCard(handle.db, card.id, { bundleIds: [b2.id] });

      const bundles = await getCardBundles(handle.db, card.id);
      expect(bundles.map((b) => b.id)).toEqual([b2.id]);
    });
  });

  describe("deleteCard", () => {
    it("removes the card", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });

      await deleteCard(handle.db, card.id);

      const fetched = await getCardById(handle.db, card.id);
      expect(fetched).toBeNull();
    });

    it("cascades to FSRS entry via FK", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });

      await deleteCard(handle.db, card.id);

      const fsrs = await handle.db
        .select()
        .from(schema.cardFsrs)
        .where(eq(schema.cardFsrs.cardId, card.id));
      expect(fsrs).toHaveLength(0);
    });
  });

  describe("searchCards", () => {
    it("returns cards matching LIKE query on front", async () => {
      await createCard(handle.db, { type: "knowledge", front: "What is photosynthesis?", back: "A" });
      await createCard(handle.db, { type: "knowledge", front: "Capital of France?", back: "Paris" });
      await createCard(handle.db, { type: "knowledge", front: "Photosynthesis light reactions", back: "B" });

      const results = await searchCards(handle.db, "photosynthesis");
      expect(results).toHaveLength(2);
    });

    it("returns empty array for no matches", async () => {
      await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
      const results = await searchCards(handle.db, "zzzzzz");
      expect(results).toEqual([]);
    });
  });

  describe("getUntaggedCardsByBundle", () => {
    it("returns only cards in bundle that have no tags", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const tag = await createTag(handle.db, "t");

      const tagged = await createCard(handle.db, {
        type: "knowledge",
        front: "tagged",
        back: "A",
        bundleIds: [bundle.id],
        tagIds: [tag.id],
      });
      const untagged = await createCard(handle.db, {
        type: "knowledge",
        front: "untagged",
        back: "A",
        bundleIds: [bundle.id],
      });
      const outside = await createCard(handle.db, {
        type: "knowledge",
        front: "outside",
        back: "A",
      });

      const result = await getUntaggedCardsByBundle(handle.db, bundle.id);
      expect(result.map((c) => c.id)).toEqual([untagged.id]);
      expect(result.map((c) => c.id)).not.toContain(tagged.id);
      expect(result.map((c) => c.id)).not.toContain(outside.id);
    });

    it("returns empty array when bundle has no cards", async () => {
      const bundle = await createBundle(handle.db, { title: "empty" });
      const result = await getUntaggedCardsByBundle(handle.db, bundle.id);
      expect(result).toEqual([]);
    });
  });

  describe("getCardsByTag", () => {
    it("returns cards with the specified tag", async () => {
      const tag = await createTag(handle.db, "bio");
      const tagged = await createCard(handle.db, {
        type: "knowledge",
        front: "tagged",
        back: "A",
        tagIds: [tag.id],
      });
      const untagged = await createCard(handle.db, {
        type: "knowledge",
        front: "untagged",
        back: "A",
      });

      const result = await getCardsByTag(handle.db, tag.id);
      expect(result.map((r) => r.cards.id)).toEqual([tagged.id]);
      expect(result.map((r) => r.cards.id)).not.toContain(untagged.id);
    });
  });

  describe("getCardsByBundle", () => {
    it("returns cards in bundle ordered by order field", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c1 = await createCard(handle.db, {
        type: "knowledge",
        front: "1",
        back: "A",
        bundleIds: [bundle.id],
      });
      const c2 = await createCard(handle.db, {
        type: "knowledge",
        front: "2",
        back: "A",
        bundleIds: [bundle.id],
      });

      // Manually set order so c2 comes first
      await handle.db
        .update(schema.bundleCards)
        .set({ order: 1 })
        .where(eq(schema.bundleCards.cardId, c1.id));
      await handle.db
        .update(schema.bundleCards)
        .set({ order: 0 })
        .where(eq(schema.bundleCards.cardId, c2.id));

      const result = await getCardsByBundle(handle.db, bundle.id);
      expect(result.map((r) => r.cards.id)).toEqual([c2.id, c1.id]);
    });
  });

  describe("addTagsToCard", () => {
    it("adds tags without removing existing ones", async () => {
      const tagA = await createTag(handle.db, "a");
      const tagB = await createTag(handle.db, "b");
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        tagIds: [tagA.id],
      });

      await addTagsToCard(handle.db, card.id, [tagB.id]);

      const tags = await getCardTags(handle.db, card.id);
      expect(tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());
    });

    it("is a no-op for empty tagIds", async () => {
      const card = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });

      await addTagsToCard(handle.db, card.id, []);

      const tags = await getCardTags(handle.db, card.id);
      expect(tags).toEqual([]);
    });
  });
});
