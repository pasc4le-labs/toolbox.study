import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import {
  createExam,
  startExamAttempt,
  getExamById,
  getAllExams,
  submitExamAnswer,
  getExamAnswers,
  getExamQuestions,
  completeExamAttempt,
  getExamResults,
} from "@/lib/services/exam";
import { createCard } from "@/lib/services/card";
import { createBundle, addCardsToBundle } from "@/lib/services/bundle";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";

describe("exam service", () => {
  let handle: TestDbHandle;
  let bundleId: number;

  beforeEach(async () => {
    handle = await createTestDb();
    const bundle = await createBundle(handle.db, { title: "B" });
    bundleId = bundle.id;
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  async function seedMultiRadioCard(
    front: string,
    correctIndex = 0,
  ): Promise<number> {
    const card = await createCard(handle.db, {
      type: "multi_radio",
      front,
      back: "A",
      options: ["a", "b", "c"],
      correctIndices: [correctIndex],
      bundleIds: [bundleId],
    });
    return card.id;
  }

  async function seedKnowledgeCard(front: string): Promise<number> {
    const card = await createCard(handle.db, {
      type: "knowledge",
      front,
      back: "A",
      bundleIds: [bundleId],
    });
    return card.id;
  }

  describe("createExam", () => {
    it("creates an exam with defaults", async () => {
      const exam = await createExam(handle.db, {
        title: "Midterm",
        bundleId,
        questionCount: 5,
      });
      expect(exam?.id).toBeGreaterThan(0);
      expect(exam?.title).toBe("Midterm");
      expect(exam?.questionCount).toBe(5);
      expect(exam?.pointsPerCorrect).toBe(1);
      expect(exam?.pointsPerWrong).toBe(0);
      expect(exam?.timeLimitSeconds).toBeNull();
      expect(exam?.difficultyFilter).toBeNull();
    });

    it("creates exam with custom settings", async () => {
      const exam = await createExam(handle.db, {
        title: "Final",
        bundleId,
        questionCount: 20,
        timeLimitSeconds: 300,
        difficultyFilter: 0.5,
        pointsPerCorrect: 2,
        pointsPerWrong: -1,
      });
      expect(exam?.timeLimitSeconds).toBe(300);
      expect(exam?.difficultyFilter).toBe(0.5);
      expect(exam?.pointsPerCorrect).toBe(2);
      expect(exam?.pointsPerWrong).toBe(-1);
    });
  });

  describe("getExamById / getAllExams", () => {
    it("returns exam or null", async () => {
      const exam = await createExam(handle.db, { title: "E", bundleId, questionCount: 1 });
      expect((await getExamById(handle.db, exam.id))?.id).toBe(exam.id);
      expect(await getExamById(handle.db, 9999)).toBeNull();
    });

    it("returns all exams ordered by createdAt", async () => {
      await createExam(handle.db, { title: "A", bundleId, questionCount: 1 });
      await createExam(handle.db, { title: "B", bundleId, questionCount: 1 });
      const all = await getAllExams(handle.db);
      expect(all.map((e) => e.title)).toEqual(["A", "B"]);
    });
  });

  describe("startExamAttempt", () => {
    it("throws if exam does not exist", async () => {
      await expect(startExamAttempt(handle.db, 9999)).rejects.toThrow();
    });

    it("creates attempt, selects questions, and excludes knowledge cards", async () => {
      await seedMultiRadioCard("q1");
      await seedMultiRadioCard("q2");
      await seedKnowledgeCard("k1");

      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 5,
      });
      const { attempt, exam: examResult, questions } = await startExamAttempt(
        handle.db,
        exam.id,
      );
      expect(attempt.id).toBeGreaterThan(0);
      expect(examResult.id).toBe(exam.id);
      expect(questions).toHaveLength(2);
      // Only multi_radio cards
      for (const q of questions) {
        expect(q.card.type).not.toBe("knowledge");
      }
    });

    it("selects only up to questionCount when bundle has more", async () => {
      for (let i = 0; i < 10; i++) await seedMultiRadioCard(`q${i}`);

      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 3,
      });
      const { questions } = await startExamAttempt(handle.db, exam.id);
      expect(questions).toHaveLength(3);
    });

    it("selects all available cards when fewer than questionCount", async () => {
      await seedMultiRadioCard("q1");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 5,
      });
      const { questions } = await startExamAttempt(handle.db, exam.id);
      expect(questions).toHaveLength(1);
    });

    it("returns empty questions when no eligible cards", async () => {
      await seedKnowledgeCard("k1");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 1,
      });
      const { questions } = await startExamAttempt(handle.db, exam.id);
      expect(questions).toEqual([]);
    });
  });

  describe("submitExamAnswer / getExamAnswers / getExamQuestions", () => {
    it("upserts answer: submitting twice replaces the previous", async () => {
      await seedMultiRadioCard("q1");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 1,
      });
      const { attempt, questions } = await startExamAttempt(handle.db, exam.id);
      const cardId = questions[0]!.card.id;

      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId,
        order: 0,
        answer: "0",
        isCorrect: false,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId,
        order: 0,
        answer: "0",
        isCorrect: true,
      });

      const answers = await getExamAnswers(handle.db, attempt.id);
      expect(answers).toHaveLength(1);
      expect(answers[0]?.isCorrect).toBe(true);
    });

    it("returns answers ordered by order", async () => {
      const c1 = await seedMultiRadioCard("q1");
      const c2 = await seedMultiRadioCard("q2");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 2,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c1,
        order: 1,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c2,
        order: 0,
        answer: "0",
        isCorrect: false,
      });

      const answers = await getExamAnswers(handle.db, attempt.id);
      // order: c2=0, c1=1
      expect(answers.map((a) => a.cardId)).toEqual([c2, c1]);
    });

    it("getExamQuestions joins with card data", async () => {
      const id = await seedMultiRadioCard("q1");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 1,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      const questions = await getExamQuestions(handle.db, attempt.id);
      expect(questions).toHaveLength(1);
      expect(questions[0]?.card.id).toBe(id);
      expect(questions[0]?.card.type).toBe("multi_radio");
    });
  });

  describe("completeExamAttempt", () => {
    it("score = 1.0 when all answers are correct", async () => {
      const c1 = await seedMultiRadioCard("q1");
      const c2 = await seedMultiRadioCard("q2");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 2,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c1,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c2,
        order: 1,
        answer: "0",
        isCorrect: true,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      expect(score).toBe(1);
    });

    it("score is proportional for mixed correct/incorrect", async () => {
      const c1 = await seedMultiRadioCard("q1");
      const c2 = await seedMultiRadioCard("q2");
      const c3 = await seedMultiRadioCard("q3");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 3,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c1,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c2,
        order: 1,
        answer: "0",
        isCorrect: false,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c3,
        order: 2,
        answer: "0",
        isCorrect: false,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      // 1 correct out of 3 graded = 0.333...
      expect(score).toBeCloseTo(1 / 3, 2);
    });

    it("negative scoring clamps score to 0 minimum", async () => {
      const c1 = await seedMultiRadioCard("q1");
      const c2 = await seedMultiRadioCard("q2");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 2,
        pointsPerCorrect: 1,
        pointsPerWrong: -5,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c1,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c2,
        order: 1,
        answer: "0",
        isCorrect: false,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      // 1*1 + 1*-5 = -4 / max 2*1 = 2 => -2 => clamped to 0
      expect(score).toBe(0);
    });

    it("unanswered auto-graded questions count as wrong", async () => {
      const c1 = await seedMultiRadioCard("q1");
      const c2 = await seedMultiRadioCard("q2");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 2,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      // Only answer one, leave other unanswered
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c1,
        order: 0,
        answer: "0",
        isCorrect: true,
      });

      const score = await completeExamAttempt(handle.db, attempt.id);
      // 1 correct, 1 wrong (unanswered multi_radio) = 0.5
      expect(score).toBe(0.5);

      // All answers should now exist (placeholder for unanswered)
      const answers = await getExamAnswers(handle.db, attempt.id);
      expect(answers).toHaveLength(2);
    });

    it("throws on non-existent attempt", async () => {
      await expect(completeExamAttempt(handle.db, 9999)).rejects.toThrow();
    });
  });

  describe("getExamResults", () => {
    it("returns attempt, exam, and answers with card details", async () => {
      const c = await seedMultiRadioCard("q1");
      const exam = await createExam(handle.db, {
        title: "E",
        bundleId,
        questionCount: 1,
      });
      const { attempt } = await startExamAttempt(handle.db, exam.id);
      await submitExamAnswer(handle.db, {
        attemptId: attempt.id,
        cardId: c,
        order: 0,
        answer: "0",
        isCorrect: true,
      });
      await completeExamAttempt(handle.db, attempt.id);

      const results = await getExamResults(handle.db, attempt.id);
      expect(results?.attempt.id).toBe(attempt.id);
      expect(results?.exam?.id).toBe(exam.id);
      expect(results?.answers).toHaveLength(1);
      expect(results?.answers[0]?.card?.id).toBe(c);
    });

    it("returns null for non-existent attempt", async () => {
      const results = await getExamResults(handle.db, 9999);
      expect(results).toBeNull();
    });
  });
});
