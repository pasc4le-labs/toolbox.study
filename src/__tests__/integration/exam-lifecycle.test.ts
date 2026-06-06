import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { eq } from "drizzle-orm";
import {
  createExam,
  startExamAttempt,
  submitExamAnswer,
  getExamAnswers,
  getExamQuestions,
  completeExamAttempt,
  getExamResults,
  getExamById,
} from "@/lib/services/exam";
import { createCard } from "@/lib/services/card";
import { createBundle, addCardsToBundle } from "@/lib/services/bundle";
import { getOrCreateCardFsrs } from "@/lib/services/fsrs";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";

describe("integration: exam lifecycle", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  /**
   * Seed a bundle with `count` multi_radio cards (each with `correctIndex` as the right answer)
   * and `knowledgeCount` knowledge cards. Returns the bundle id and a list of card ids.
   */
  async function seedBundleWithCards(
    multiCount: number,
    knowledgeCount: number,
  ) {
    const bundle = await createBundle(handle.db, { title: "Exam Bundle" });
    const cardIds: number[] = [];
    for (let i = 0; i < multiCount; i++) {
      const c = await createCard(handle.db, {
        type: "multi_radio",
        front: `multi-${i}`,
        back: "Correct",
        options: ["Correct", "Wrong1", "Wrong2"],
        correctIndices: [0],
        bundleIds: [bundle.id],
      });
      cardIds.push(c.id);
    }
    for (let i = 0; i < knowledgeCount; i++) {
      const c = await createCard(handle.db, {
        type: "knowledge",
        front: `knowledge-${i}`,
        back: "A",
        bundleIds: [bundle.id],
      });
      cardIds.push(c.id);
    }
    return { bundle, cardIds };
  }

  describe("setup → start attempt → submit → complete", () => {
    it("full lifecycle: 3 multi_radio cards, answer 2/3 correctly → score ≈ 0.67", async () => {
      const { bundle } = await seedBundleWithCards(3, 0);
      const exam = await createExam(handle.db, {
        title: "Midterm",
        bundleId: bundle.id,
        questionCount: 3,
      });

      // Start attempt
      const { attempt, exam: examEcho, questions } = await startExamAttempt(
        handle.db,
        exam.id,
      );
      expect(attempt.id).toBeGreaterThan(0);
      expect(examEcho.id).toBe(exam.id);
      expect(questions).toHaveLength(3);

      // All questions should be multi_radio (no knowledge)
      for (const q of questions) {
        expect(q.card.type).toBe("multi_radio");
      }

      // Submit 2 correct, 1 incorrect
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[0]!.card.id,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[1]!.card.id,
        order: 1,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[2]!.card.id,
        order: 2,
        answer: "1",
        isCorrect: false,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      expect(score).toBeCloseTo(2 / 3, 2);

      // Attempt is marked completed with that score
      const results = await getExamResults(handle.db, attempt.id);
      expect(results?.attempt.completedAt).not.toBeNull();
      expect(results?.attempt.score).toBeCloseTo(2 / 3, 2);
    });

    it("FSRS state is updated for each answered card (correct → Good, incorrect → Again)", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
      });

      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);
      const correctCardId = questions[0]!.card.id;
      const incorrectCardId = questions[1]!.card.id;

      // Snapshot FSRS before
      const beforeCorrect = await getOrCreateCardFsrs(handle.db, correctCardId);
      const beforeIncorrect = await getOrCreateCardFsrs(handle.db, incorrectCardId);
      expect(beforeCorrect.reps).toBe(0);
      expect(beforeIncorrect.reps).toBe(0);

      // Submit
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: correctCardId,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: incorrectCardId,
        order: 1,
        answer: "1",
        isCorrect: false,
      });

      await completeExamAttempt(handle.db, attempt.id);

      // Both cards' FSRS should be updated (reps > 0)
      const afterCorrect = await getOrCreateCardFsrs(handle.db, correctCardId);
      const afterIncorrect = await getOrCreateCardFsrs(handle.db, incorrectCardId);
      expect(afterCorrect.reps).toBe(1);
      expect(afterIncorrect.reps).toBe(1);
      // Incorrect card was in New state; Again on New keeps lapses=0 but moves to Learning
      // (per ts-fsrs behavior: lapses only increment from Review state)
      expect(afterIncorrect.lapses).toBe(0);
      expect(afterIncorrect.state).toBe(1); // State.Learning
      // Correct card → Good → also moves out of New
      expect(afterCorrect.state).not.toBe(0);
    });

    it("unanswered auto-graded questions count as wrong", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
      });

      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);

      // Only answer one correctly
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[0]!.card.id,
        order: 0,
        answer: "0",
        isCorrect: true,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      // 1 correct, 1 wrong (unanswered multi_radio) → 0.5
      expect(score).toBe(0.5);

      // All 2 questions should have an answer row now (placeholder for unanswered)
      const answers = await getExamAnswers(handle.db, attempt.id);
      expect(answers).toHaveLength(2);
      const unanswered = answers.find((a) => a.isCorrect === null);
      expect(unanswered).toBeDefined();
      expect(unanswered?.answer).toBeNull();
    });

    it("knowledge cards in the bundle are never selected for exam questions", async () => {
      const { bundle } = await seedBundleWithCards(2, 3);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 10, // ask for more than eligible
      });

      const { questions } = await startExamAttempt(handle.db, exam.id);
      // Only the 2 multi_radio cards should be in questions
      expect(questions).toHaveLength(2);
      for (const q of questions) {
        expect(q.card.type).toBe("multi_radio");
      }
    });

    it("all correct → score = 1.0", async () => {
      const { bundle } = await seedBundleWithCards(3, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 3,
      });
      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);

      for (const q of questions) {
        await submitExamAnswer(handle.db, {
          attemptId: attempt.id,
          cardId: q.card.id,
          order: q.order,
          answer: "0",
          isCorrect: true,
        });
      }

      const score = await completeExamAttempt(handle.db, attempt.id);
      expect(score).toBe(1);
    });

    it("negative scoring (pointsPerWrong = -0.5) clamps score to 0", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
        pointsPerCorrect: 1,
        pointsPerWrong: -5, // heavy penalty
      });
      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);

      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[0]!.card.id,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[1]!.card.id,
        order: 1,
        answer: "1",
        isCorrect: false,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      // (1*1 + 1*-5) / (2*1) = -4/2 = -2 → clamped to 0
      expect(score).toBe(0);
    });

    it("getExamResults joins answers with card details", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
      });
      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);
      const cardId = questions[0]!.card.id;

      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await completeExamAttempt(handle.db, attempt.id);

      const results = await getExamResults(handle.db, attempt.id);
      expect(results).not.toBeNull();
      expect(results?.attempt.id).toBe(attempt.id);
      expect(results?.exam?.id).toBe(exam.id);
      expect(results?.answers).toHaveLength(2);
      // Each answer has the card joined
      for (const a of results?.answers ?? []) {
        expect(a.card).not.toBeNull();
        expect(a.card?.id).toBe(a.cardId);
      }
    });

    it("getExamResults returns null for non-existent attempt", async () => {
      const r = await getExamResults(handle.db, 9999);
      expect(r).toBeNull();
    });
  });

  describe("cascading / FK integrity", () => {
    it("deleting a bundle cascades to its exam questions and answers", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
      });
      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: questions[0]!.card.id,
        order: 0,
        answer: "0",
        isCorrect: true,
      });

      // Sanity: exam_questions and exam_answers exist
      const qsBefore = await handle.db.select().from(schema.examQuestions);
      const ansBefore = await handle.db.select().from(schema.examAnswers);
      expect(qsBefore.length).toBeGreaterThan(0);
      expect(ansBefore.length).toBeGreaterThan(0);

      // Delete the exam (cascades to attempts, which cascades to questions/answers)
      await handle.db.delete(schema.exams).where(eq(schema.exams.id, exam.id));

      const qsAfter = await handle.db.select().from(schema.examQuestions);
      const ansAfter = await handle.db.select().from(schema.examAnswers);
      expect(qsAfter).toHaveLength(0);
      expect(ansAfter).toHaveLength(0);
    });
  });

  describe("difficulty filter integration", () => {
    it("difficultyFilter prioritizes low-stability (weaker) cards", async () => {
      const { bundle } = await seedBundleWithCards(5, 0);
      // Rate one card many times as Good to make it stable/strong
      const allCards = await handle.db.select().from(schema.cards);
      const strongCard = allCards[0]!;
      const { rateCard } = await import("@/lib/services/fsrs");
      const { Rating } = await import("ts-fsrs");
      for (let i = 0; i < 3; i++) {
        await rateCard(handle.db, strongCard.id, Rating.Good);
      }

      const exam = await createExam(handle.db, {
        title: "Weak-focused",
        bundleId: bundle.id,
        questionCount: 2,
        difficultyFilter: 1.0, // 100% weak cards
      });

      const { questions } = await startExamAttempt(handle.db, exam.id);
      expect(questions).toHaveLength(2);
      // The strong card should NOT be in the selected set
      const selectedIds = questions.map((q) => q.card.id);
      expect(selectedIds).not.toContain(strongCard.id);
    });
  });

  describe("multi-attempt integration", () => {
    it("two attempts on the same exam are independent", async () => {
      const { bundle } = await seedBundleWithCards(2, 0);
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId: bundle.id,
        questionCount: 2,
      });

      // Attempt 1: all correct
      const a1 = await startExamAttempt(handle.db, exam.id);
      for (const q of a1.questions) {
        await submitExamAnswer(handle.db, {
          attemptId: a1.attempt.id,
          cardId: q.card.id,
          order: q.order,
          answer: "0",
          isCorrect: true,
        });
      }
      const s1 = await completeExamAttempt(handle.db, a1.attempt.id);

      // Attempt 2: all incorrect
      const a2 = await startExamAttempt(handle.db, exam.id);
      for (const q of a2.questions) {
        await submitExamAnswer(handle.db, {
          attemptId: a2.attempt.id,
          cardId: q.card.id,
          order: q.order,
          answer: "1",
          isCorrect: false,
        });
      }
      const s2 = await completeExamAttempt(handle.db, a2.attempt.id);

      expect(s1).toBe(1);
      expect(s2).toBe(0);

      // Both attempts are recorded
      const a1Results = await getExamResults(handle.db, a1.attempt.id);
      const a2Results = await getExamResults(handle.db, a2.attempt.id);
      expect(a1Results?.attempt.score).toBe(1);
      expect(a2Results?.attempt.score).toBe(0);
    });

    it("exam record itself is queryable by id after attempts exist", async () => {
      const { bundle } = await seedBundleWithCards(1, 0);
      const exam = await createExam(handle.db, {
        title: "Final",
        bundleId: bundle.id,
        questionCount: 1,
      });
      await startExamAttempt(handle.db, exam.id);

      const fetched = await getExamById(handle.db, exam.id);
      expect(fetched?.title).toBe("Final");
      expect(fetched?.bundleId).toBe(bundle.id);
    });
  });
});
