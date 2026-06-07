import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import {
  createBundle,
  updateBundle,
  deleteBundle,
  getAllBundles,
  getBundleById,
  addCardsToBundle,
  removeCardFromBundle,
  reorderBundleCard,
  getBundleExamStats,
  getBundlePastAttempts,
  getBundleCardWeakness,
} from "@/lib/services/bundle";
import { createCard } from "@/lib/services/card";
import { createExam } from "@/lib/services/exam";
import { startExamAttempt, submitExamAnswer, completeExamAttempt } from "@/lib/services/exam";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";

describe("bundle service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("createBundle", () => {
    it("creates a bundle with a title", async () => {
      const bundle = await createBundle(handle.db, { title: "Test Bundle" });
      expect(bundle?.id).toBeGreaterThan(0);
      expect(bundle?.title).toBe("Test Bundle");
      expect(bundle?.description).toBeNull();
    });

    it("creates a bundle with a description", async () => {
      const bundle = await createBundle(handle.db, {
        title: "B",
        description: "My description",
      });
      expect(bundle?.description).toBe("My description");
    });

    it("creates a bundle with emoji and coverColor", async () => {
      const bundle = await createBundle(handle.db, {
        title: "Bio",
        emoji: "🧬",
        coverColor: "#7c3aed",
      });
      expect(bundle?.emoji).toBe("🧬");
      expect(bundle?.coverColor).toBe("#7c3aed");
    });

    it("defaults emoji and coverColor to null when not provided", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      expect(bundle?.emoji).toBeNull();
      expect(bundle?.coverColor).toBeNull();
    });

    it("creates a bundle with only emoji", async () => {
      const bundle = await createBundle(handle.db, {
        title: "Books",
        emoji: "📚",
      });
      expect(bundle?.emoji).toBe("📚");
      expect(bundle?.coverColor).toBeNull();
    });
  });

  describe("updateBundle", () => {
    it("updates the title", async () => {
      const bundle = await createBundle(handle.db, { title: "Old" });
      await updateBundle(handle.db, bundle.id, { title: "New" });
      const updated = await getBundleById(handle.db, bundle.id);
      expect(updated?.title).toBe("New");
    });

    it("updates exam settings", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      await updateBundle(handle.db, bundle.id, {
        examQuestionCount: 10,
        examTimeLimitSeconds: 300,
      });
      const updated = await getBundleById(handle.db, bundle.id);
      expect(updated?.examQuestionCount).toBe(10);
      expect(updated?.examTimeLimitSeconds).toBe(300);
    });

    it("sets emoji and coverColor", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      await updateBundle(handle.db, bundle.id, {
        emoji: "🔬",
        coverColor: "#ef4444",
      });
      const updated = await getBundleById(handle.db, bundle.id);
      expect(updated?.emoji).toBe("🔬");
      expect(updated?.coverColor).toBe("#ef4444");
    });

    it("clears emoji and coverColor when set to null", async () => {
      const bundle = await createBundle(handle.db, {
        title: "B",
        emoji: "🎯",
        coverColor: "#22c55e",
      });
      await updateBundle(handle.db, bundle.id, {
        emoji: null,
        coverColor: null,
      });
      const updated = await getBundleById(handle.db, bundle.id);
      expect(updated?.emoji).toBeNull();
      expect(updated?.coverColor).toBeNull();
    });

    it("preserves emoji and coverColor when not specified", async () => {
      const bundle = await createBundle(handle.db, {
        title: "B",
        emoji: "🧠",
        coverColor: "#3b82f6",
      });
      await updateBundle(handle.db, bundle.id, { title: "New" });
      const updated = await getBundleById(handle.db, bundle.id);
      expect(updated?.title).toBe("New");
      expect(updated?.emoji).toBe("🧠");
      expect(updated?.coverColor).toBe("#3b82f6");
    });
  });

  describe("deleteBundle", () => {
    it("removes the bundle", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      await deleteBundle(handle.db, bundle.id);
      const fetched = await getBundleById(handle.db, bundle.id);
      expect(fetched).toBeNull();
    });
  });

  describe("getAllBundles", () => {
    it("returns bundles ordered by title ascending", async () => {
      await createBundle(handle.db, { title: "Zebra" });
      await createBundle(handle.db, { title: "Alpha" });
      const all = await getAllBundles(handle.db);
      expect(all.map((b) => b.title)).toEqual(["Alpha", "Zebra"]);
    });
  });

  describe("getBundleById", () => {
    it("returns bundle when exists", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const fetched = await getBundleById(handle.db, bundle.id);
      expect(fetched?.id).toBe(bundle.id);
    });

    it("returns null when not found", async () => {
      const fetched = await getBundleById(handle.db, 9999);
      expect(fetched).toBeNull();
    });
  });

  describe("addCardsToBundle", () => {
    it("adds cards starting at order 0", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c1 = await createCard(handle.db, { type: "knowledge", front: "1", back: "A" });
      const c2 = await createCard(handle.db, { type: "knowledge", front: "2", back: "A" });

      await addCardsToBundle(handle.db, bundle.id, [c1.id, c2.id]);

      const rows = await handle.db
        .select()
        .from(schema.bundleCards)
        .where((await import("drizzle-orm")).eq(schema.bundleCards.bundleId, bundle.id));
      const orderById = new Map(rows.map((r) => [r.cardId, r.order]));
      expect(orderById.get(c1.id)).toBe(0);
      expect(orderById.get(c2.id)).toBe(1);
    });

    it("appends after existing cards", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c1 = await createCard(handle.db, { type: "knowledge", front: "1", back: "A" });
      const c2 = await createCard(handle.db, { type: "knowledge", front: "2", back: "A" });
      const c3 = await createCard(handle.db, { type: "knowledge", front: "3", back: "A" });

      await addCardsToBundle(handle.db, bundle.id, [c1.id, c2.id]);
      await addCardsToBundle(handle.db, bundle.id, [c3.id]);

      const { eq } = await import("drizzle-orm");
      const rows = await handle.db
        .select()
        .from(schema.bundleCards)
        .where(eq(schema.bundleCards.bundleId, bundle.id));
      const orderById = new Map(rows.map((r) => [r.cardId, r.order]));
      expect(orderById.get(c1.id)).toBe(0);
      expect(orderById.get(c2.id)).toBe(1);
      expect(orderById.get(c3.id)).toBe(2);
    });
  });

  describe("removeCardFromBundle", () => {
    it("removes the link between bundle and card", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
      await addCardsToBundle(handle.db, bundle.id, [card.id]);

      await removeCardFromBundle(handle.db, bundle.id, card.id);

      const { eq, and } = await import("drizzle-orm");
      const rows = await handle.db
        .select()
        .from(schema.bundleCards)
        .where(
          and(
            eq(schema.bundleCards.bundleId, bundle.id),
            eq(schema.bundleCards.cardId, card.id),
          ),
        );
      expect(rows).toHaveLength(0);
    });
  });

  describe("reorderBundleCard", () => {
    it("updates the card's order", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
      await addCardsToBundle(handle.db, bundle.id, [card.id]);

      await reorderBundleCard(handle.db, bundle.id, card.id, 5);

      const { eq, and } = await import("drizzle-orm");
      const [row] = await handle.db
        .select()
        .from(schema.bundleCards)
        .where(
          and(
            eq(schema.bundleCards.bundleId, bundle.id),
            eq(schema.bundleCards.cardId, card.id),
          ),
        );
      expect(row?.order).toBe(5);
    });
  });

  describe("getBundleExamStats", () => {
    it("returns zero stats when no exams", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const stats = await getBundleExamStats(handle.db, bundle.id);
      expect(stats.totalAttempts).toBe(0);
      expect(stats.completedAttempts).toBe(0);
      expect(stats.avgScore).toBe(0);
      expect(stats.bestScore).toBe(0);
      expect(stats.worstScore).toBe(0);
      expect(stats.totalTimeSeconds).toBe(0);
      expect(stats.exams).toEqual([]);
      expect(stats.attempts).toEqual([]);
    });

    it("returns aggregated stats with attempts", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const exam = await createExam(handle.db, {
        title: "E1",
        bundleId: bundle.id,
        questionCount: 1,
      });

      // Create and complete an attempt
      const c = await createCard(handle.db, {
        type: "multi_radio",
        front: "Q",
        back: "A",
        options: ["a", "b"],
        correctIndices: [0],
        bundleIds: [bundle.id],
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c.id,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await completeExamAttempt(handle.db, attempt.id);

      const stats = await getBundleExamStats(handle.db, bundle.id);
      expect(stats.totalAttempts).toBe(1);
      expect(stats.completedAttempts).toBe(1);
      expect(stats.avgScore).toBe(1);
      expect(stats.bestScore).toBe(1);
    });
  });

  describe("getBundlePastAttempts", () => {
    it("returns attempts ordered by startedAt DESC", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 1,
      });
      await createCard(handle.db, {
        type: "multi_radio",
        front: "Q",
        back: "A",
        options: ["a", "b"],
        correctIndices: [0],
        bundleIds: [bundle.id],
      });

      // Start two attempts with a small delay
      const a1 = await startExamAttempt(handle.db, exam.id);
      await new Promise((r) => setTimeout(r, 5));
      const a2 = await startExamAttempt(handle.db, exam.id);

      const attempts = await getBundlePastAttempts(handle.db, bundle.id);
      expect(attempts).toHaveLength(2);
      // DESC: a2 first
      expect(attempts[0]?.attempt.id).toBe(a2.attempt.id);
      expect(attempts[1]?.attempt.id).toBe(a1.attempt.id);
    });
  });

  describe("getBundleCardWeakness", () => {
    it("returns empty when no cards in bundle", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const result = await getBundleCardWeakness(handle.db, bundle.id);
      expect(result).toEqual([]);
    });

    it("returns cards with no answers when none answered", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const c = await createCard(handle.db, {
        type: "knowledge",
        front: "Q",
        back: "A",
        bundleIds: [bundle.id],
      });
      const result = await getBundleCardWeakness(handle.db, bundle.id);
      // No answers => filtered out (total = 0)
      expect(result).toEqual([]);
      expect(c).toBeDefined();
    });

    it("returns weakness stats sorted by incorrectRate DESC", async () => {
      const bundle = await createBundle(handle.db, { title: "B" });
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 5,
      });

      const weakCard = await createCard(handle.db, {
        type: "multi_radio",
        front: "weak",
        back: "A",
        options: ["a", "b"],
        correctIndices: [0],
        bundleIds: [bundle.id],
      });
      const strongCard = await createCard(handle.db, {
        type: "multi_radio",
        front: "strong",
        back: "A",
        options: ["a", "b"],
        correctIndices: [0],
        bundleIds: [bundle.id],
      });

      // Run an attempt where weak is wrong, strong is right
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: weakCard.id,
        order: 0,
        answer: "1",
        isCorrect: false,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: strongCard.id,
        order: 1,
        answer: "0",
        isCorrect: true,
      });
      await completeExamAttempt(handle.db, attempt.id);

      const result = await getBundleCardWeakness(handle.db, bundle.id);
      expect(result).toHaveLength(2);
      // Weak card has incorrectRate=1, strong has incorrectRate=0
      expect(result[0]?.card.id).toBe(weakCard.id);
      expect(result[0]?.incorrectRate).toBe(1);
      expect(result[1]?.card.id).toBe(strongCard.id);
      expect(result[1]?.incorrectRate).toBe(0);
    });
  });
});
