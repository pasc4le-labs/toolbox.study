import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { buildManifest, serializeSelectedItems } from "@/lib/exchange-serialize";
import { createCard } from "@/lib/services/card";
import { createBundle, addCardsToBundle } from "@/lib/services/bundle";
import { createExam } from "@/lib/services/exam";
import { createTag } from "@/lib/services/tag";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";

describe("exchange-serialize", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("buildManifest", () => {
    it("returns empty array for empty selection", async () => {
      const items = await buildManifest(handle.db, {});
      expect(items).toEqual([]);
    });

    it("returns card items with type and hasExplanation meta", async () => {
      const c1 = await createCard(handle.db, {
        type: "knowledge",
        front: "Q1",
        back: "A1",
        explanation: "because",
      });
      const c2 = await createCard(handle.db, {
        type: "knowledge",
        front: "Q2",
        back: "A2",
      });

      const items = await buildManifest(handle.db, { cards: [c1.id, c2.id] });

      expect(items).toHaveLength(2);
      const withExpl = items.find((i) => i.id === c1.id);
      const withoutExpl = items.find((i) => i.id === c2.id);
      expect(withExpl?.kind).toBe("card");
      expect(withExpl?.meta.type).toBe("knowledge");
      expect(withExpl?.meta.hasExplanation).toBe(true);
      expect(withoutExpl?.meta.hasExplanation).toBe(false);
    });

    it("truncates displayName to 60 chars", async () => {
      const longFront = "X".repeat(100);
      const c = await createCard(handle.db, {
        type: "knowledge",
        front: longFront,
        back: "A",
      });

      const items = await buildManifest(handle.db, { cards: [c.id] });
      expect(items[0]?.displayName).toHaveLength(60);
    });

    it("returns bundle items with cardCount in meta", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c1 = await createCard(handle.db, { type: "knowledge", front: "1", back: "A" });
      const c2 = await createCard(handle.db, { type: "knowledge", front: "2", back: "A" });
      await addCardsToBundle(handle.db, bundle.id, [c1.id, c2.id]);

      const items = await buildManifest(handle.db, { bundles: [bundle.id] });
      expect(items).toHaveLength(1);
      expect(items[0]?.kind).toBe("bundle");
      expect(items[0]?.meta.cardCount).toBe(2);
    });

    it("returns exam items with questionCount and hasTimer in meta", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const examWithTimer = await createExam(handle.db, {
        title: "Timed",
        bundleId: bundle.id,
        questionCount: 10,
        timeLimitSeconds: 600,
      });
      const examNoTimer = await createExam(handle.db, {
        title: "Untimed",
        bundleId: bundle.id,
        questionCount: 5,
      });

      const items = await buildManifest(handle.db, {
        exams: [examWithTimer.id, examNoTimer.id],
      });
      expect(items).toHaveLength(2);

      const timed = items.find((i) => i.id === examWithTimer.id);
      const untimed = items.find((i) => i.id === examNoTimer.id);
      expect(timed?.meta.questionCount).toBe(10);
      expect(timed?.meta.hasTimer).toBe(true);
      expect(untimed?.meta.hasTimer).toBe(false);
    });
  });

  describe("serializeSelectedItems", () => {
    it("returns empty arrays for empty items", async () => {
      const result = await serializeSelectedItems(handle.db, []);
      expect(result.cards).toEqual([]);
      expect(result.bundles).toEqual([]);
      expect(result.exams).toEqual([]);
    });

    it("returns card data including tagNames", async () => {
      const tag = await createTag(handle.db, "bio");
      const c = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        tagIds: [tag.id],
      });

      const result = await serializeSelectedItems(handle.db, [
        { kind: "card", id: c.id },
      ]);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.id).toBe(c.id);
      expect(result.cards[0]?.tagNames).toEqual(["bio"]);
    });

    it("returns empty tagNames for cards without tags", async () => {
      const c = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
      });
      const result = await serializeSelectedItems(handle.db, [
        { kind: "card", id: c.id },
      ]);
      expect(result.cards[0]?.tagNames).toEqual([]);
    });

    it("auto-includes bundle's cards in the output", async () => {
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

      // Pass ONLY the bundle, no individual card IDs
      const result = await serializeSelectedItems(handle.db, [
        { kind: "bundle", id: bundle.id },
      ]);

      expect(result.bundles).toHaveLength(1);
      expect(result.cards.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
      expect(result.bundles[0]?.cardIds.sort()).toEqual([c1.id, c2.id].sort());
    });

    it("returns exam data with bundleId mapping", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 10,
        timeLimitSeconds: 600,
        difficultyFilter: 0.4,
        pointsPerCorrect: 2,
        pointsPerWrong: -1,
      });

      const result = await serializeSelectedItems(handle.db, [
        { kind: "exam", id: exam.id },
      ]);

      expect(result.exams).toHaveLength(1);
      expect(result.exams[0]?.bundleId).toBe(bundle.id);
      expect(result.exams[0]?.timeLimitSeconds).toBe(600);
      expect(result.exams[0]?.pointsPerCorrect).toBe(2);
    });

    it("keeps options and correctIndices as stored (JSON strings)", async () => {
      const c = await createCard(handle.db, {
        type: "multi_radio",
        front: "Q",
        back: "A",
        options: ["x", "y", "z"],
        correctIndices: [2],
      });
      const result = await serializeSelectedItems(handle.db, [
        { kind: "card", id: c.id },
      ]);
      expect(result.cards[0]?.options).toBe(JSON.stringify(["x", "y", "z"]));
      expect(result.cards[0]?.correctIndices).toBe(JSON.stringify([2]));
    });
  });
});
