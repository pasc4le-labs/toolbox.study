import { eq, and } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { createTag } from '@/lib/services';
import { persistNow } from '@/db';
import type { Db } from '@/lib/services/types';
import type { FullSnapshot } from './sync-serialize';

export type SyncImportResult = {
  cardsImported: number;
  cardsUpdated: number;
  tagsImported: number;
  bundlesImported: number;
  cardFsrsUpdated: number;
  reviewLogsImported: number;
  examsImported: number;
  examAttemptsImported: number;
  examAnswersImported: number;
  examQuestionsImported: number;
  todosImported: number;
};

export async function importFullSnapshot(
  db: Db,
  snapshot: FullSnapshot,
): Promise<SyncImportResult> {
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  const result: SyncImportResult = {
    cardsImported: 0,
    cardsUpdated: 0,
    tagsImported: 0,
    bundlesImported: 0,
    cardFsrsUpdated: 0,
    reviewLogsImported: 0,
    examsImported: 0,
    examAttemptsImported: 0,
    examAnswersImported: 0,
    examQuestionsImported: 0,
    todosImported: 0,
  };

  // 1. Import cards: dedup by front + type
  const cardIdMap = new Map<number, number>();

  for (const cardData of snapshot.cards) {
    const existing = await db
      .select({ id: schema.cards.id, updatedAt: schema.cards.updatedAt })
      .from(schema.cards)
      .where(and(
        eq(schema.cards.front, cardData.front),
        eq(schema.cards.type, cardData.type),
      ))
      .limit(1);

    if (existing.length > 0) {
      cardIdMap.set(cardData.id, existing[0].id);
      if (cardData.updatedAt > existing[0].updatedAt) {
        await db
          .update(schema.cards)
          .set({
            back: cardData.back,
            explanation: cardData.explanation,
            options: cardData.options,
            correctIndices: cardData.correctIndices,
            updatedAt: cardData.updatedAt,
          })
          .where(eq(schema.cards.id, existing[0].id));
        result.cardsUpdated++;
      }
    } else {
      const [newCard] = await db
        .insert(schema.cards)
        .values({
          type: cardData.type as "multi_radio" | "multi_select" | "open" | "knowledge",
          front: cardData.front,
          back: cardData.back,
          explanation: cardData.explanation,
          options: cardData.options,
          correctIndices: cardData.correctIndices,
          createdAt: cardData.createdAt,
          updatedAt: cardData.updatedAt,
        })
        .returning();

      if (newCard) {
        cardIdMap.set(cardData.id, newCard.id);
        result.cardsImported++;
      }
    }
  }

  // 2. Import tags: dedup by name
  const tagIdMap = new Map<number, number>();
  for (const tagData of snapshot.tags) {
    const existing = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.name, tagData.name))
      .limit(1);
    if (existing.length > 0) {
      tagIdMap.set(tagData.id, existing[0].id);
    } else {
      const tag = await createTag(db, tagData.name);
      if (tag) {
        tagIdMap.set(tagData.id, tag.id);
        result.tagsImported++;
      }
    }
  }

  // 3. Import card_tags: only new (cardId, tagId) pairs
  for (const ct of snapshot.cardTags) {
    const newCardId = cardIdMap.get(ct.cardId);
    const newTagId = tagIdMap.get(ct.tagId);
    if (!newCardId || !newTagId) continue;

    const existing = await db
      .select()
      .from(schema.cardTags)
      .where(and(
        eq(schema.cardTags.cardId, newCardId),
        eq(schema.cardTags.tagId, newTagId),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.cardTags).values({
        cardId: newCardId,
        tagId: newTagId,
      });
    }
  }

  // 4. Import bundles: always create new
  const bundleIdMap = new Map<number, number>();
  for (const bundleData of snapshot.bundles) {
    const [newBundle] = await db
      .insert(schema.bundles)
      .values({
        title: bundleData.title,
        description: bundleData.description,
        emoji: bundleData.emoji,
        coverColor: bundleData.coverColor,
        examQuestionCount: bundleData.examQuestionCount,
        examTimeLimitSeconds: bundleData.examTimeLimitSeconds,
        examDifficultyFilter: bundleData.examDifficultyFilter,
        examPointsPerCorrect: bundleData.examPointsPerCorrect,
        examPointsPerWrong: bundleData.examPointsPerWrong,
        createdAt: bundleData.createdAt,
      })
      .returning();

    if (newBundle) {
      bundleIdMap.set(bundleData.id, newBundle.id);
      result.bundlesImported++;
    }
  }

  // 5. Import bundle_cards: only new (cardId, bundleId) pairs
  for (const bc of snapshot.bundleCards) {
    const newCardId = cardIdMap.get(bc.cardId);
    const newBundleId = bundleIdMap.get(bc.bundleId);
    if (!newCardId || !newBundleId) continue;

    const existing = await db
      .select()
      .from(schema.bundleCards)
      .where(and(
        eq(schema.bundleCards.cardId, newCardId),
        eq(schema.bundleCards.bundleId, newBundleId),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.bundleCards).values({
        cardId: newCardId,
        bundleId: newBundleId,
        order: bc.order,
      });
    }
  }

  // 6. Import card_fsrs: update if remote has more reps or later lastReview
  for (const fsrsData of snapshot.cardFsrs) {
    const newCardId = cardIdMap.get(fsrsData.cardId);
    if (!newCardId) continue;

    const existing = await db
      .select()
      .from(schema.cardFsrs)
      .where(eq(schema.cardFsrs.cardId, newCardId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.cardFsrs).values({
        cardId: newCardId,
        difficulty: fsrsData.difficulty,
        stability: fsrsData.stability,
        state: fsrsData.state,
        due: fsrsData.due,
        elapsedDays: fsrsData.elapsedDays,
        scheduledDays: fsrsData.scheduledDays,
        reps: fsrsData.reps,
        lapses: fsrsData.lapses,
        lastReview: fsrsData.lastReview,
        learningSteps: fsrsData.learningSteps,
      });
    } else {
      const shouldUpdate =
        fsrsData.reps > existing[0].reps ||
        (fsrsData.lastReview !== null &&
          existing[0].lastReview !== null &&
          fsrsData.lastReview > existing[0].lastReview);
      if (shouldUpdate) {
        await db
          .update(schema.cardFsrs)
          .set({
            difficulty: fsrsData.difficulty,
            stability: fsrsData.stability,
            state: fsrsData.state,
            due: fsrsData.due,
            elapsedDays: fsrsData.elapsedDays,
            scheduledDays: fsrsData.scheduledDays,
            reps: fsrsData.reps,
            lapses: fsrsData.lapses,
            lastReview: fsrsData.lastReview,
            learningSteps: fsrsData.learningSteps,
          })
          .where(eq(schema.cardFsrs.cardId, newCardId));
        result.cardFsrsUpdated++;
      }
    }
  }

  // 7. Import review_logs: append-only, dedup by cardId + review
  for (const log of snapshot.reviewLogs) {
    const newCardId = cardIdMap.get(log.cardId);
    if (!newCardId) continue;

    const existing = await db
      .select()
      .from(schema.reviewLogs)
      .where(and(
        eq(schema.reviewLogs.cardId, newCardId),
        eq(schema.reviewLogs.review, log.review),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.reviewLogs).values({
        cardId: newCardId,
        rating: log.rating,
        state: log.state,
        due: log.due,
        stability: log.stability,
        difficulty: log.difficulty,
        elapsedDays: log.elapsedDays,
        lastElapsedDays: log.lastElapsedDays,
        scheduledDays: log.scheduledDays,
        review: log.review,
        learningSteps: log.learningSteps,
      });
      result.reviewLogsImported++;
    }
  }

  // 8. Import exams: always create new
  const examIdMap = new Map<number, number>();
  for (const examData of snapshot.exams) {
    const newBundleId = examData.bundleId
      ? bundleIdMap.get(examData.bundleId) ?? null
      : null;

    const [newExam] = await db
      .insert(schema.exams)
      .values({
        title: examData.title,
        bundleId: newBundleId,
        questionCount: examData.questionCount,
        timeLimitSeconds: examData.timeLimitSeconds,
        difficultyFilter: examData.difficultyFilter,
        pointsPerCorrect: examData.pointsPerCorrect,
        pointsPerWrong: examData.pointsPerWrong,
        createdAt: examData.createdAt,
      })
      .returning();

    if (newExam) {
      examIdMap.set(examData.id, newExam.id);
      result.examsImported++;
    }
  }

  // 9. Import exam_attempts: append-only
  const attemptIdMap = new Map<number, number>();
  for (const attempt of snapshot.examAttempts) {
    const newExamId = examIdMap.get(attempt.examId);
    if (!newExamId) continue;

    const [newAttempt] = await db
      .insert(schema.examAttempts)
      .values({
        examId: newExamId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        score: attempt.score,
      })
      .returning();

    if (newAttempt) {
      attemptIdMap.set(attempt.id, newAttempt.id);
      result.examAttemptsImported++;
    }
  }

  // 10. Import exam_answers: for mapped attempt IDs
  for (const answer of snapshot.examAnswers) {
    const newAttemptId = attemptIdMap.get(answer.attemptId);
    const newCardId = cardIdMap.get(answer.cardId);
    if (!newAttemptId || !newCardId) continue;

    await db.insert(schema.examAnswers).values({
      attemptId: newAttemptId,
      cardId: newCardId,
      order: answer.order,
      answer: answer.answer,
      isCorrect: answer.isCorrect,
    });
    result.examAnswersImported++;
  }

  // 11. Import exam_questions: for mapped attempt IDs
  for (const question of snapshot.examQuestions) {
    const newAttemptId = attemptIdMap.get(question.attemptId);
    const newCardId = cardIdMap.get(question.cardId);
    if (!newAttemptId || !newCardId) continue;

    await db.insert(schema.examQuestions).values({
      attemptId: newAttemptId,
      cardId: newCardId,
      order: question.order,
    });
    result.examQuestionsImported++;
  }

  // 12. Import todos: append-only, dedup by title + createdAt
  for (const todo of snapshot.todos) {
    const existing = await db
      .select()
      .from(schema.todos)
      .where(and(
        eq(schema.todos.title, todo.title),
        eq(schema.todos.createdAt, todo.createdAt),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.todos).values({
        title: todo.title,
        done: todo.done,
        createdAt: todo.createdAt,
      });
      result.todosImported++;
    }
  }

  await persistNow();
  return result;
}
