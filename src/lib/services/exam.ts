import { eq, and, inArray, sql, asc } from 'drizzle-orm';
import { Rating } from 'ts-fsrs';
import * as schema from '@/db/schema';
import { persistNow } from '@/db';
import type { Db } from './types';
import { rateCard } from './fsrs';

export async function createExam(
  db: Db,
  data: {
    title: string;
    bundleId: number;
    questionCount: number;
    timeLimitSeconds?: number | null;
    difficultyFilter?: number | null;
    pointsPerCorrect?: number;
    pointsPerWrong?: number;
  },
) {
  const [exam] = await db
    .insert(schema.exams)
    .values({
      title: data.title,
      bundleId: data.bundleId,
      questionCount: data.questionCount,
      timeLimitSeconds: data.timeLimitSeconds ?? null,
      difficultyFilter: data.difficultyFilter ?? null,
      pointsPerCorrect: data.pointsPerCorrect ?? 1,
      pointsPerWrong: data.pointsPerWrong ?? 0,
    })
    .returning();
  return exam ?? null;
}

export async function startExamAttempt(
  db: Db,
  examId: number,
): Promise<{ attempt: typeof schema.examAttempts.$inferSelect; exam: typeof schema.exams.$inferSelect; questions: Array<{ card: typeof schema.cards.$inferSelect; order: number }> }> {
  const exam = await getExamById(db, examId);
  if (!exam) throw new Error('Exam not found');

  // Get bundle cards
  const bundleCards = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, exam.bundleId!))
    .orderBy(asc(schema.bundleCards.order));

  // Filter out 'knowledge' type cards (not suitable for exams)
  let eligible = bundleCards.filter((r) => r.cards.type !== 'knowledge');
  let selected = eligible.slice(0, exam.questionCount);

  // If difficultyFilter is set, prioritize low-stability cards
  if (exam.difficultyFilter != null && exam.difficultyFilter > 0) {
    // Get FSRS data for eligible cards
    const cardIds = eligible.map((r) => r.cards.id);
    const fsrsRows = await db
      .select()
      .from(schema.cardFsrs)
      .where(inArray(schema.cardFsrs.cardId, cardIds));

    const fsrsMap = new Map(fsrsRows.map((r) => [r.cardId, r]));

    // Sort by stability ascending (lower stability = weaker cards)
    eligible.sort((a, b) => {
      const aFsrs = fsrsMap.get(a.cards.id);
      const bFsrs = fsrsMap.get(b.cards.id);
      const aStab = aFsrs?.stability ?? 999;
      const bStab = bFsrs?.stability ?? 999;
      return aStab - bStab;
    });

    // Take a mix: difficultyFilter% from weakest, rest random
    const weakCount = Math.round((exam.questionCount * exam.difficultyFilter));

    // Shuffle a copy of eligible for the random portion
    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const weakCards = eligible.slice(0, weakCount);
    const weakCardIds = new Set(weakCards.map((r) => r.cards.id));
    const randomPool = shuffled.filter((r) => !weakCardIds.has(r.cards.id));
    const randomCards = randomPool.slice(0, exam.questionCount - weakCount);

    selected = [...weakCards, ...randomCards];
  } else {
    // Random selection
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    selected = eligible.slice(0, exam.questionCount);
  }

  // Create attempt
  const [attempt] = await db
    .insert(schema.examAttempts)
    .values({
      examId,
      startedAt: Date.now(),
    })
    .returning();

  if (!attempt) throw new Error('Failed to create exam attempt');

  // Persist selected questions
  if (selected.length > 0) {
    await db.insert(schema.examQuestions).values(
      selected.map((r, i) => ({
        attemptId: attempt.id,
        cardId: r.cards.id,
        order: i,
      })),
    );
  }

  // Insert answers (empty placeholders for navigation)
  const questions = selected.map((r, i) => ({
    card: r.cards,
    order: i,
  }));

  return { attempt, exam, questions };
}

export async function getExamById(db: Db, id: number) {
  const [exam] = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.id, id))
    .limit(1);
  return exam ?? null;
}

export async function getAllExams(db: Db) {
  return db.select().from(schema.exams).orderBy(asc(schema.exams.createdAt));
}

export async function submitExamAnswer(
  db: Db,
  data: {
    attemptId: number;
    cardId: number;
    order: number;
    answer: string | null;
    isCorrect: boolean | null;
  },
) {
  // Upsert: delete existing answer for this attempt+card, then insert
  await db
    .delete(schema.examAnswers)
    .where(
      and(
        eq(schema.examAnswers.attemptId, data.attemptId),
        eq(schema.examAnswers.cardId, data.cardId),
      ),
    );

  const [answer] = await db
    .insert(schema.examAnswers)
    .values({
      attemptId: data.attemptId,
      cardId: data.cardId,
      order: data.order,
      answer: data.answer,
      isCorrect: data.isCorrect,
    })
    .returning();
  return answer ?? null;
}

export async function getExamAnswers(db: Db, attemptId: number) {
  return db
    .select()
    .from(schema.examAnswers)
    .where(eq(schema.examAnswers.attemptId, attemptId))
    .orderBy(asc(schema.examAnswers.order));
}

export async function getExamQuestions(db: Db, attemptId: number) {
  return db
    .select({
      id: schema.examQuestions.id,
      attemptId: schema.examQuestions.attemptId,
      cardId: schema.examQuestions.cardId,
      order: schema.examQuestions.order,
      card: schema.cards,
    })
    .from(schema.examQuestions)
    .innerJoin(schema.cards, eq(schema.examQuestions.cardId, schema.cards.id))
    .where(eq(schema.examQuestions.attemptId, attemptId))
    .orderBy(asc(schema.examQuestions.order));
}

export async function completeExamAttempt(db: Db, attemptId: number) {
  const [attempt] = await db
    .select()
    .from(schema.examAttempts)
    .where(eq(schema.examAttempts.id, attemptId))
    .limit(1);

  if (!attempt) throw new Error('Attempt not found');

  const exam = await getExamById(db, attempt.examId);
  if (!exam) throw new Error('Exam not found');

  // Insert placeholder answers for unanswered questions
  const questions = await getExamQuestions(db, attemptId);
  const existingAnswers = await getExamAnswers(db, attemptId);
  const answeredCardIds = new Set(existingAnswers.map((a) => a.cardId));
  const unanswered = questions.filter((q) => !answeredCardIds.has(q.cardId));

  if (unanswered.length > 0) {
    await db.insert(schema.examAnswers).values(
      unanswered.map((q) => ({
        attemptId,
        cardId: q.cardId,
        order: q.order,
        answer: null,
        isCorrect: null,
      })),
    );
  }

  // Re-fetch all answers after inserting placeholders
  const allAnswers = await getExamAnswers(db, attemptId);

  // Auto-gradable question types
  const autoGradableCardIds = new Set(
    questions.filter((q) => q.card.type === 'multi_radio' || q.card.type === 'multi_select').map((q) => q.cardId),
  );

  const pointsPerCorrect = exam.pointsPerCorrect ?? 1;
  const pointsPerWrong = exam.pointsPerWrong ?? 0;

  const answered = allAnswers.filter((a) => a.isCorrect !== null);
  const correctCount = answered.filter((a) => a.isCorrect).length;
  // Wrong = explicitly wrong + unanswered auto-gradable
  const unansweredAutoGradable = allAnswers.filter(
    (a) => a.isCorrect === null && a.answer === null && autoGradableCardIds.has(a.cardId),
  ).length;
  const wrongCount = answered.filter((a) => a.isCorrect === false).length + unansweredAutoGradable;
  const totalGraded = correctCount + wrongCount;
  const totalPoints = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
  const maxPoints = totalGraded * pointsPerCorrect;

  // score normalized 0-1 (clamped to 0 if negative scoring)
  const score = maxPoints > 0 ? Math.max(0, totalPoints / maxPoints) : 0;

  await db
    .update(schema.examAttempts)
    .set({ completedAt: Date.now(), score })
    .where(eq(schema.examAttempts.id, attemptId));

  // Update FSRS state for each explicitly answered auto-graded answer.
  // Correct → Rating.Good (reinforce), incorrect → Rating.Again (re-schedule soon).
  // Open-type answers (isCorrect === null) and unanswered questions are skipped.
  for (const answer of answered) {
    try {
      const rating = answer.isCorrect ? Rating.Good : Rating.Again;
      await rateCard(db, answer.cardId, rating);
    } catch (e) {
      // Don't fail exam completion if FSRS update fails for a single card
      console.error(`Failed to update FSRS for card ${answer.cardId}:`, e);
    }
  }

  await persistNow();
  return score;
}

export async function getExamResults(db: Db, attemptId: number) {
  const [attempt] = await db
    .select()
    .from(schema.examAttempts)
    .where(eq(schema.examAttempts.id, attemptId))
    .limit(1);
  if (!attempt) return null;

  const exam = await getExamById(db, attempt.examId);
  const answers = await getExamAnswers(db, attemptId);

  // Get card details for each answer
  const cardIds = answers.map((a) => a.cardId);
  const cards = cardIds.length > 0
    ? await db
        .select()
        .from(schema.cards)
        .where(inArray(schema.cards.id, cardIds))
    : [];

  const cardMap = new Map(cards.map((c) => [c.id, c]));

  return {
    attempt,
    exam,
    answers: answers.map((a) => ({
      ...a,
      card: cardMap.get(a.cardId) ?? null,
    })),
  };
}
