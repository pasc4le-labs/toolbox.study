import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { createCard } from "@/lib/services/card";
import { createBundle, addCardsToBundle, getBundleById } from "@/lib/services/bundle";
import { createExam, getAllExams, getExamById } from "@/lib/services/exam";
import { createTag, getAllTags } from "@/lib/services/tag";
import { getAllCards, getCardTags } from "@/lib/services/card";
import { serializeSelectedItems } from "@/lib/exchange-serialize";
import { importExchangeData } from "@/lib/exchange-import";
import {
  createTestDb,
  destroyTestDb,
  type TestDbHandle,
} from "@/__tests__/helpers/test-db";

describe("integration: import/export round-trip", () => {
  let source: TestDbHandle;
  let dest: TestDbHandle;

  beforeEach(async () => {
    source = await createTestDb();
    dest = await createTestDb();
    // Silence noisy log output from exchange modules
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    destroyTestDb(source);
    destroyTestDb(dest);
    vi.restoreAllMocks();
  });

  async function importIntoDest(serialized: {
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
  }) {
    return importExchangeData(dest.db, serialized);
  }

  it("round-trips cards with tags: source → serialize → import → dest matches", async () => {
    const tagBio = await createTag(source.db, "biology");
    const tagCells = await createTag(source.db, "cells");
    const c1 = await createCard(source.db, {
      type: "knowledge",
      front: "What is a mitochondrion?",
      back: "The powerhouse of the cell",
      explanation: "Produces ATP",
      tagIds: [tagBio.id, tagCells.id],
    });
    const c2 = await createCard(source.db, {
      type: "multi_radio",
      front: "How many chambers in the heart?",
      back: "4",
      options: ["2", "3", "4", "5"],
      correctIndices: [2],
      tagIds: [tagBio.id],
    });

    const serialized = await serializeSelectedItems(source.db, [
      { kind: "card", id: c1.id },
      { kind: "card", id: c2.id },
    ]);

    expect(serialized.cards).toHaveLength(2);
    expect(serialized.cards.find((c) => c.id === c1.id)?.tagNames.sort()).toEqual(
      ["biology", "cells"],
    );
    expect(serialized.cards.find((c) => c.id === c2.id)?.tagNames).toEqual([
      "biology",
    ]);
    expect(serialized.cards.find((c) => c.id === c2.id)?.options).toBe(
      JSON.stringify(["2", "3", "4", "5"]),
    );

    // Import into dest
    const result = await importIntoDest(serialized);
    expect(result.cards).toBe(2);

    // Verify dest has the same data (new IDs)
    const destCards = await getAllCards(dest.db);
    expect(destCards).toHaveLength(2);
    const dC1 = destCards.find((c) => c.front === c1.front);
    const dC2 = destCards.find((c) => c.front === c2.front);
    expect(dC1).toBeDefined();
    expect(dC2).toBeDefined();
    expect(dC1?.back).toBe(c1.back);
    expect(dC1?.explanation).toBe(c1.explanation);
    expect(dC2?.type).toBe("multi_radio");
    expect(dC2?.options).toBe(JSON.stringify(["2", "3", "4", "5"]));
    expect(dC2?.correctIndices).toBe(JSON.stringify([2]));

    // Tags should be present
    const destTags = await getAllTags(dest.db);
    expect(destTags.map((t) => t.name).sort()).toEqual(["biology", "cells"]);

    // Tag attachments should match
    const dC1Tags = await getCardTags(dest.db, dC1!.id);
    expect(dC1Tags.map((t) => t.name).sort()).toEqual(["biology", "cells"]);
    const dC2Tags = await getCardTags(dest.db, dC2!.id);
    expect(dC2Tags.map((t) => t.name)).toEqual(["biology"]);
  });

  it("round-trips bundles with auto-included cards in correct order", async () => {
    const b = await createBundle(source.db, { title: "B" });
    const c1 = await createCard(source.db, { type: "knowledge", front: "1", back: "A" });
    const c2 = await createCard(source.db, { type: "knowledge", front: "2", back: "A" });
    const c3 = await createCard(source.db, { type: "knowledge", front: "3", back: "A" });
    await addCardsToBundle(source.db, b.id, [c1.id, c2.id, c3.id]);

    // Only the bundle is selected — cards should be auto-included
    const serialized = await serializeSelectedItems(source.db, [
      { kind: "bundle", id: b.id },
    ]);

    expect(serialized.bundles).toHaveLength(1);
    expect(serialized.bundles[0]?.title).toBe("B");
    expect(serialized.bundles[0]?.cardIds).toEqual([c1.id, c2.id, c3.id]);
    expect(serialized.cards.map((c) => c.id).sort()).toEqual(
      [c1.id, c2.id, c3.id].sort(),
    );

    // Import
    const result = await importIntoDest(serialized);
    expect(result.cards).toBe(3);
    expect(result.bundles).toBe(1);

    // Verify dest bundle has 3 cards
    const { getCardsByBundle } = await import("@/lib/services/card");
    const { getAllBundles } = await import("@/lib/services/bundle");
    const all = await getAllBundles(dest.db);
    const dBundle = all[0]!;
    expect(dBundle.title).toBe("B");

    const dCards = await getCardsByBundle(dest.db, dBundle.id);
    expect(dCards).toHaveLength(3);
    // The order is determined by import insertion order; verify all 3 are present
    const dFronts = dCards.map((c) => c.cards.front).sort();
    expect(dFronts).toEqual(["1", "2", "3"]);
  });

  it("round-trips exams with bundle reference and full configuration", async () => {
    const b = await createBundle(source.db, { title: "B" });
    const c1 = await createCard(source.db, {
      type: "multi_radio",
      front: "Q1",
      back: "A",
      options: ["x", "y"],
      correctIndices: [0],
    });
    await addCardsToBundle(source.db, b.id, [c1.id]);
    const exam = await createExam(source.db, {
      title: "Final",
      bundleId: b.id,
      questionCount: 5,
      timeLimitSeconds: 600,
      difficultyFilter: 0.4,
      pointsPerCorrect: 2,
      pointsPerWrong: -1,
    });

    // Select bundle (which auto-includes its card) + the exam
    const serialized = await serializeSelectedItems(source.db, [
      { kind: "bundle", id: b.id },
      { kind: "exam", id: exam.id },
    ]);

    expect(serialized.exams).toHaveLength(1);
    expect(serialized.exams[0]?.title).toBe("Final");
    expect(serialized.exams[0]?.timeLimitSeconds).toBe(600);
    expect(serialized.exams[0]?.difficultyFilter).toBe(0.4);
    expect(serialized.exams[0]?.pointsPerCorrect).toBe(2);
    expect(serialized.exams[0]?.pointsPerWrong).toBe(-1);

    const result = await importIntoDest(serialized);
    expect(result.exams).toBe(1);

    const dExams = await getAllExams(dest.db);
    expect(dExams).toHaveLength(1);
    expect(dExams[0]?.title).toBe("Final");
    expect(dExams[0]?.timeLimitSeconds).toBe(600);
    expect(dExams[0]?.difficultyFilter).toBe(0.4);
    expect(dExams[0]?.pointsPerCorrect).toBe(2);
    expect(dExams[0]?.pointsPerWrong).toBe(-1);
    // Bundle reference should be present
    expect(dExams[0]?.bundleId).not.toBeNull();
  });

  it("detects duplicate cards on second import (same front + type skipped)", async () => {
    const c1 = await createCard(source.db, { type: "knowledge", front: "Q", back: "A" });

    const serialized = await serializeSelectedItems(source.db, [
      { kind: "card", id: c1.id },
    ]);

    // First import
    const r1 = await importIntoDest(serialized);
    expect(r1.cards).toBe(1);

    // Second import of the same data — duplicate detection should kick in
    const r2 = await importIntoDest(serialized);
    expect(r2.cards).toBe(0); // no new cards imported

    // Dest still has only 1 card (the original, not duplicated)
    const destCards = await getAllCards(dest.db);
    expect(destCards).toHaveLength(1);
    expect(destCards[0]?.back).toBe("A");
  });

  it("full round-trip: cards + bundles + exams match (except IDs)", async () => {
    // ── Source setup ──
    const tag1 = await createTag(source.db, "topic-a");
    const tag2 = await createTag(source.db, "topic-b");

    const c1 = await createCard(source.db, {
      type: "knowledge",
      front: "Q1",
      back: "A1",
      explanation: "explanation 1",
      tagIds: [tag1.id],
    });
    const c2 = await createCard(source.db, {
      type: "multi_radio",
      front: "Q2",
      back: "A2",
      options: ["a", "b", "c"],
      correctIndices: [1],
      explanation: null,
      tagIds: [tag2.id],
    });
    const c3 = await createCard(source.db, {
      type: "multi_select",
      front: "Q3",
      back: "A3",
      options: ["x", "y", "z"],
      correctIndices: [0, 2],
      tagIds: [tag1.id, tag2.id],
    });

    const b1 = await createBundle(source.db, { title: "Bundle1", description: "d1" });
    await addCardsToBundle(source.db, b1.id, [c1.id, c2.id]);
    const b2 = await createBundle(source.db, { title: "Bundle2" });
    await addCardsToBundle(source.db, b2.id, [c3.id]);

    const exam1 = await createExam(source.db, {
      title: "E1",
      bundleId: b1.id,
      questionCount: 2,
      timeLimitSeconds: 120,
    });
    const exam2 = await createExam(source.db, {
      title: "E2",
      bundleId: b2.id,
      questionCount: 5,
      pointsPerWrong: -0.5,
    });

    // ── Serialize all ──
    const serialized = await serializeSelectedItems(source.db, [
      { kind: "card", id: c1.id },
      { kind: "card", id: c2.id },
      { kind: "card", id: c3.id },
      { kind: "bundle", id: b1.id },
      { kind: "bundle", id: b2.id },
      { kind: "exam", id: exam1.id },
      { kind: "exam", id: exam2.id },
    ]);

    expect(serialized.cards).toHaveLength(3);
    expect(serialized.bundles).toHaveLength(2);
    expect(serialized.exams).toHaveLength(2);

    // ── Import into dest ──
    const r = await importIntoDest(serialized);
    expect(r).toEqual({ cards: 3, bundles: 2, exams: 2 });

    // ── Verify dest matches source (except IDs) ──
    const dCards = await getAllCards(dest.db);
    expect(dCards).toHaveLength(3);
    for (const c of dCards) {
      const sC = [c1, c2, c3].find((s) => s.front === c.front)!;
      expect(c.type).toBe(sC.type);
      expect(c.back).toBe(sC.back);
      expect(c.explanation).toBe(sC.explanation);
      expect(c.options).toBe(sC.options);
      expect(c.correctIndices).toBe(sC.correctIndices);
    }

    const dTags = await getAllTags(dest.db);
    expect(dTags.map((t) => t.name).sort()).toEqual(["topic-a", "topic-b"]);

    // Tag attachments
    const dC1 = dCards.find((c) => c.front === "Q1")!;
    const dC1Tags = await getCardTags(dest.db, dC1.id);
    expect(dC1Tags.map((t) => t.name)).toEqual(["topic-a"]);
    const dC3 = dCards.find((c) => c.front === "Q3")!;
    const dC3Tags = await getCardTags(dest.db, dC3.id);
    expect(dC3Tags.map((t) => t.name).sort()).toEqual(["topic-a", "topic-b"]);

    // Bundles
    const { getAllBundles } = await import("@/lib/services/bundle");
    const dBundles = await getAllBundles(dest.db);
    expect(dBundles).toHaveLength(2);
    const dB1 = dBundles.find((b) => b.title === "Bundle1")!;
    expect(dB1.description).toBe("d1");

    // Exams
    const dExams = await getAllExams(dest.db);
    expect(dExams).toHaveLength(2);
    const dE1 = dExams.find((e) => e.title === "E1")!;
    expect(dE1.timeLimitSeconds).toBe(120);
    expect(dE1.questionCount).toBe(2);
    expect(dE1.bundleId).not.toBeNull();

    const dE2 = dExams.find((e) => e.title === "E2")!;
    expect(dE2.pointsPerWrong).toBe(-0.5);
    expect(dE2.bundleId).not.toBeNull();
  });

  it("importing the same bundle twice does not create duplicate cards (duplicate detection)", async () => {
    const c1 = await createCard(source.db, { type: "knowledge", front: "dup", back: "A" });
    const b = await createBundle(source.db, { title: "B" });
    await addCardsToBundle(source.db, b.id, [c1.id]);

    const serialized = await serializeSelectedItems(source.db, [
      { kind: "bundle", id: b.id },
    ]);

    const r1 = await importIntoDest(serialized);
    expect(r1.cards).toBe(1);
    expect(r1.bundles).toBe(1);

    // Import again
    const r2 = await importIntoDest(serialized);
    expect(r2.cards).toBe(0); // card duplicate
    expect(r2.bundles).toBe(1); // bundle always created (no dup detection on bundles)

    // Dest has 1 card total, but 2 bundles
    const dCards = await getAllCards(dest.db);
    expect(dCards).toHaveLength(1);
    const { getAllBundles } = await import("@/lib/services/bundle");
    const dBundles = await getAllBundles(dest.db);
    expect(dBundles).toHaveLength(2);
  });

  it("serialize with empty selection produces empty result; import is a no-op", async () => {
    const empty = await serializeSelectedItems(source.db, []);
    expect(empty).toEqual({ cards: [], bundles: [], exams: [] });

    const r = await importIntoDest(empty);
    expect(r).toEqual({ cards: 0, bundles: 0, exams: 0 });

    const dCards = await getAllCards(dest.db);
    expect(dCards).toEqual([]);
  });
});
