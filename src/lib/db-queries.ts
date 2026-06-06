import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import { eq, and, inArray, sql, asc, lte, isNull, or } from 'drizzle-orm';
import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs';
import * as schema from '@/db/schema';
import { persistNow } from '@/db';

// ── Helpers ──

type Db = SQLJsDatabase<typeof schema>;

function parseJson<T>(val: string | null): T | null {
  if (!val) return null;
  try { return JSON.parse(val) as T; } catch { return null; }
}

// ── Card CRUD ──

export async function createCard(
  db: Db,
  data: {
    type: 'multi_radio' | 'multi_select' | 'open' | 'knowledge';
    front: string;
    back: string;
    explanation?: string | null;
    options?: string[] | null;
    correctIndices?: number[] | null;
    tagIds?: number[];
    bundleIds?: number[];
  },
) {
  const now = Date.now();
  const [card] = await db
    .insert(schema.cards)
    .values({
      type: data.type,
      front: data.front,
      back: data.back,
      explanation: data.explanation ?? null,
      options: data.options ? JSON.stringify(data.options) : null,
      correctIndices: data.correctIndices ? JSON.stringify(data.correctIndices) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!card) throw new Error('Failed to create card');

  // Create FSRS state
  const emptyFsrs = createEmptyCard(new Date(now));
  await db.insert(schema.cardFsrs).values({
    cardId: card.id,
    difficulty: emptyFsrs.difficulty,
    stability: emptyFsrs.stability,
    state: emptyFsrs.state,
    due: emptyFsrs.due.getTime(),
    elapsedDays: emptyFsrs.elapsed_days,
    scheduledDays: emptyFsrs.scheduled_days,
    reps: emptyFsrs.reps,
    lapses: emptyFsrs.lapses,
    lastReview: emptyFsrs.last_review?.getTime() ?? null,
    learningSteps: emptyFsrs.learning_steps ?? 0,
  });

  // Tags
  if (data.tagIds && data.tagIds.length > 0) {
    await db.insert(schema.cardTags).values(
      data.tagIds.map((tagId) => ({ cardId: card.id, tagId })),
    );
  }

  // Bundles
  if (data.bundleIds && data.bundleIds.length > 0) {
    await db.insert(schema.bundleCards).values(
      data.bundleIds.map((bundleId) => ({
        cardId: card.id,
        bundleId,
        order: 0,
      })),
    );
  }

  await persistNow();
  return card;
}

export async function updateCard(
  db: Db,
  id: number,
  data: {
    front?: string;
    back?: string;
    explanation?: string | null;
    options?: string[] | null;
    correctIndices?: number[] | null;
    type?: 'multi_radio' | 'multi_select' | 'open' | 'knowledge';
    tagIds?: number[];
    bundleIds?: number[];
  },
) {
  const now = Date.now();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (data.front !== undefined) updateData.front = data.front;
  if (data.back !== undefined) updateData.back = data.back;
  if (data.explanation !== undefined) updateData.explanation = data.explanation;
  if (data.options !== undefined) updateData.options = data.options ? JSON.stringify(data.options) : null;
  if (data.correctIndices !== undefined) updateData.correctIndices = data.correctIndices ? JSON.stringify(data.correctIndices) : null;
  if (data.type !== undefined) updateData.type = data.type;

  await db.update(schema.cards).set(updateData).where(eq(schema.cards.id, id));

  if (data.tagIds !== undefined) {
    await db.delete(schema.cardTags).where(eq(schema.cardTags.cardId, id));
    if (data.tagIds.length > 0) {
      await db.insert(schema.cardTags).values(
        data.tagIds.map((tagId) => ({ cardId: id, tagId })),
      );
    }
  }

  if (data.bundleIds !== undefined) {
    await db.delete(schema.bundleCards).where(eq(schema.bundleCards.cardId, id));
    if (data.bundleIds.length > 0) {
      await db.insert(schema.bundleCards).values(
        data.bundleIds.map((bundleId) => ({ cardId: id, bundleId, order: 0 })),
      );
    }
  }
}

export async function deleteCard(db: Db, id: number) {
  await db.delete(schema.cards).where(eq(schema.cards.id, id));
  await persistNow();
}

export async function getCardById(db: Db, id: number) {
  const [card] = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .limit(1);
  return card ?? null;
}

export async function getAllCards(db: Db) {
  return db.select().from(schema.cards).orderBy(asc(schema.cards.createdAt));
}

export async function searchCards(db: Db, query: string) {
  return db
    .select()
    .from(schema.cards)
    .where(sql`${schema.cards.front} LIKE ${`%${query}%`}`)
    .orderBy(asc(schema.cards.createdAt));
}

// ── Tag CRUD ──

export async function createTag(db: Db, name: string) {
  const [tag] = await db.insert(schema.tags).values({ name }).returning();
  if (tag) await persistNow();
  return tag ?? null;
}

export async function getOrCreateTag(db: Db, name: string) {
  const [existing] = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.name, name))
    .limit(1);
  if (existing) return existing;
  return createTag(db, name);
}

export async function getAllTags(db: Db) {
  return db.select().from(schema.tags).orderBy(asc(schema.tags.name));
}

export async function deleteTag(db: Db, id: number) {
  await db.delete(schema.tags).where(eq(schema.tags.id, id));
  await persistNow();
}

// ── Bundle CRUD ──

export async function createBundle(db: Db, data: { title: string; description?: string | null }) {
  const [bundle] = await db
    .insert(schema.bundles)
    .values({ title: data.title, description: data.description ?? null })
    .returning();
  if (bundle) await persistNow();
  return bundle ?? null;
}

export async function updateBundle(db: Db, id: number, data: {
  title?: string;
  description?: string | null;
  examQuestionCount?: number | null;
  examTimeLimitSeconds?: number | null;
  examDifficultyFilter?: number | null;
  examPointsPerCorrect?: number | null;
  examPointsPerWrong?: number | null;
}) {
  await db.update(schema.bundles).set(data).where(eq(schema.bundles.id, id));
  await persistNow();
}

export async function deleteBundle(db: Db, id: number) {
  await db.delete(schema.bundles).where(eq(schema.bundles.id, id));
  await persistNow();
}

export async function getAllBundles(db: Db) {
  return db.select().from(schema.bundles).orderBy(asc(schema.bundles.title));
}

export async function getBundleById(db: Db, id: number) {
  const [bundle] = await db
    .select()
    .from(schema.bundles)
    .where(eq(schema.bundles.id, id))
    .limit(1);
  return bundle ?? null;
}

// ── Bundle-card operations ──

export async function addCardsToBundle(
  db: Db,
  bundleId: number,
  cardIds: number[],
) {
  // Get current max order
  const rows = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${schema.bundleCards.order}), -1)` })
    .from(schema.bundleCards)
    .where(eq(schema.bundleCards.bundleId, bundleId));
  let nextOrder = (rows[0]?.maxOrder ?? -1) + 1;

  await db.insert(schema.bundleCards).values(
    cardIds.map((cardId) => ({ cardId, bundleId, order: nextOrder++ })),
  );
}

export async function removeCardFromBundle(db: Db, bundleId: number, cardId: number) {
  await db
    .delete(schema.bundleCards)
    .where(
      and(
        eq(schema.bundleCards.bundleId, bundleId),
        eq(schema.bundleCards.cardId, cardId),
      ),
    );
}

export async function reorderBundleCard(
  db: Db,
  bundleId: number,
  cardId: number,
  newOrder: number,
) {
  await db
    .update(schema.bundleCards)
    .set({ order: newOrder })
    .where(
      and(
        eq(schema.bundleCards.bundleId, bundleId),
        eq(schema.bundleCards.cardId, cardId),
      ),
    );
}

// ── FSRS / Review ──

export async function getOrCreateCardFsrs(db: Db, cardId: number) {
  const [existing] = await db
    .select()
    .from(schema.cardFsrs)
    .where(eq(schema.cardFsrs.cardId, cardId))
    .limit(1);
  if (existing) return existing;

  const emptyFsrs = createEmptyCard(new Date());
  const [created] = await db
    .insert(schema.cardFsrs)
    .values({
      cardId,
      difficulty: emptyFsrs.difficulty,
      stability: emptyFsrs.stability,
      state: emptyFsrs.state,
      due: emptyFsrs.due.getTime(),
      elapsedDays: emptyFsrs.elapsed_days,
      scheduledDays: emptyFsrs.scheduled_days,
      reps: emptyFsrs.reps,
      lapses: emptyFsrs.lapses,
      lastReview: emptyFsrs.last_review?.getTime() ?? null,
      learningSteps: emptyFsrs.learning_steps ?? 0,
    })
    .returning();
  return created!;
}

export async function rateCard(
  db: Db,
  cardId: number,
  rating: Rating,
  reviewTime?: Date,
) {
  const now = reviewTime ?? new Date();
  const fsrsState = await getOrCreateCardFsrs(db, cardId);
  const scheduler = fsrs();

  const { card: updatedCard, log } = scheduler.next(
    {
      difficulty: fsrsState.difficulty,
      stability: fsrsState.stability,
      state: fsrsState.state as 0 | 1 | 2 | 3,
      due: new Date(fsrsState.due),
      elapsed_days: fsrsState.elapsedDays,
      scheduled_days: fsrsState.scheduledDays,
      reps: fsrsState.reps,
      lapses: fsrsState.lapses,
      last_review: fsrsState.lastReview ? new Date(fsrsState.lastReview) : undefined,
      learning_steps: fsrsState.learningSteps,
    } as Parameters<typeof scheduler.next>[0],
    now,
    rating as Grade,
  );

  // Update card_fsrs
  await db
    .update(schema.cardFsrs)
    .set({
      difficulty: updatedCard.difficulty,
      stability: updatedCard.stability,
      state: updatedCard.state,
      due: updatedCard.due.getTime(),
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: updatedCard.scheduled_days,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
      lastReview: updatedCard.last_review?.getTime() ?? null,
      learningSteps: updatedCard.learning_steps ?? 0,
    })
    .where(eq(schema.cardFsrs.cardId, cardId));

  // Insert review log
  await db.insert(schema.reviewLogs).values({
    cardId,
    rating,
    state: updatedCard.state,
    due: updatedCard.due.getTime(),
    stability: updatedCard.stability,
    difficulty: updatedCard.difficulty,
    elapsedDays: updatedCard.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: updatedCard.scheduled_days,
    review: now.getTime(),
    learningSteps: updatedCard.learning_steps ?? 0,
  });

  return { card: updatedCard, log };
}

// ── Due cards ──

export async function getDueCards(
  db: Db,
  options?: { tagId?: number; bundleId?: number },
) {
  const now = Date.now();

  // Base query: cards with FSRS due <= now
  let query = db
    .select()
    .from(schema.cards)
    .innerJoin(schema.cardFsrs, eq(schema.cards.id, schema.cardFsrs.cardId))
    .where(lte(schema.cardFsrs.due, now))
    .orderBy(asc(schema.cardFsrs.due));

  let results = await query;

  if (options?.tagId) {
    const taggedCardIds = await db
      .select({ cardId: schema.cardTags.cardId })
      .from(schema.cardTags)
      .where(eq(schema.cardTags.tagId, options.tagId));
    const ids = new Set(taggedCardIds.map((r) => r.cardId));
    results = results.filter((r) => ids.has(r.cards.id));
  }

  if (options?.bundleId) {
    const bundleCardIds = await db
      .select({ cardId: schema.bundleCards.cardId })
      .from(schema.bundleCards)
      .where(eq(schema.bundleCards.bundleId, options.bundleId));
    const ids = new Set(bundleCardIds.map((r) => r.cardId));
    results = results.filter((r) => ids.has(r.cards.id));
  }

  return results;
}

// ── Tag stats ──

export async function getTagStats(db: Db) {
  const rows = await db
    .select({
      tagId: schema.cardTags.tagId,
      tagName: schema.tags.name,
      cardCount: sql<number>`COUNT(*)`,
      avgStability: sql<number | null>`AVG(${schema.cardFsrs.stability})`,
      stateNew: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 0 THEN 1 ELSE 0 END)`,
      stateLearning: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 1 THEN 1 ELSE 0 END)`,
      stateReview: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 2 THEN 1 ELSE 0 END)`,
      stateRelearning: sql<number>`SUM(CASE WHEN ${schema.cardFsrs.state} = 3 THEN 1 ELSE 0 END)`,
    })
    .from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .innerJoin(schema.cardFsrs, eq(schema.cardTags.cardId, schema.cardFsrs.cardId))
    .groupBy(schema.cardTags.tagId, schema.tags.name)
    .orderBy(asc(schema.tags.name));

  return rows;
}

// ── Exams ──

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
    const weakCards = eligible.slice(0, weakCount);
    const rest = eligible.slice(weakCount);

    // Shuffle rest
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    selected = [...weakCards, ...rest].slice(0, exam.questionCount);
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

/**
 * Get the questions for an exam without creating a new attempt.
 */
export async function getExamQuestions(
  db: Db,
  examId: number,
): Promise<Array<{ card: typeof schema.cards.$inferSelect; order: number }>> {
  const exam = await getExamById(db, examId);
  if (!exam || !exam.bundleId) return [];

  const bundleCards = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, exam.bundleId))
    .orderBy(asc(schema.bundleCards.order));

  return bundleCards
    .filter((r) => r.cards.type !== 'knowledge')
    .slice(0, exam.questionCount)
    .map((r) => ({ card: r.cards, order: r.bundle_cards.order }));
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

export async function completeExamAttempt(db: Db, attemptId: number) {
  const [attempt] = await db
    .select()
    .from(schema.examAttempts)
    .where(eq(schema.examAttempts.id, attemptId))
    .limit(1);

  if (!attempt) throw new Error('Attempt not found');

  const exam = await getExamById(db, attempt.examId);
  if (!exam) throw new Error('Exam not found');

  const answers = await getExamAnswers(db, attemptId);
  const answered = answers.filter((a) => a.isCorrect !== null);

  const pointsPerCorrect = exam.pointsPerCorrect ?? 1;
  const pointsPerWrong = exam.pointsPerWrong ?? 0;

  const correctCount = answered.filter((a) => a.isCorrect).length;
  const wrongCount = answered.filter((a) => a.isCorrect === false).length;
  const totalPoints = correctCount * pointsPerCorrect + wrongCount * pointsPerWrong;
  const maxPoints = answered.length * pointsPerCorrect;

  // score normalized 0-1 (clamped to 0 if negative scoring)
  const score = maxPoints > 0 ? Math.max(0, totalPoints / maxPoints) : 0;

  await db
    .update(schema.examAttempts)
    .set({ completedAt: Date.now(), score })
    .where(eq(schema.examAttempts.id, attemptId));

  // Update FSRS state for each auto-graded answer.
  // Correct → Rating.Good (reinforce), incorrect → Rating.Again (re-schedule soon).
  // Open-type answers (isCorrect === null) are skipped — no automatic FSRS update.
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

// ── AI Providers ──

export async function createAiProvider(
  db: Db,
  data: {
    name: string;
    providerType?: 'openai-compatible' | 'google' | 'anthropic';
    baseUrl: string;
    apiKey?: string | null;
    modelId: string;
    isDefault?: boolean;
  },
) {
  // If setting as default, unset all others
  if (data.isDefault) {
    await db
      .update(schema.aiProviders)
      .set({ isDefault: false })
      .where(eq(schema.aiProviders.isDefault, true));
  }

  const [provider] = await db
    .insert(schema.aiProviders)
    .values({
      name: data.name,
      providerType: data.providerType ?? 'openai-compatible',
      baseUrl: data.baseUrl,
      apiKey: data.apiKey ?? null,
      modelId: data.modelId,
      isDefault: data.isDefault ?? false,
    })
    .returning();
  return provider ?? null;
}

export async function updateAiProvider(
  db: Db,
  id: number,
  data: {
    name?: string;
    providerType?: 'openai-compatible' | 'google' | 'anthropic';
    baseUrl?: string;
    apiKey?: string | null;
    modelId?: string;
    isDefault?: boolean;
  },
) {
  if (data.isDefault) {
    await db
      .update(schema.aiProviders)
      .set({ isDefault: false })
      .where(eq(schema.aiProviders.isDefault, true));
  }

  await db
    .update(schema.aiProviders)
    .set(data)
    .where(eq(schema.aiProviders.id, id));
}

export async function deleteAiProvider(db: Db, id: number) {
  await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id));
}

export async function getAllAiProviders(db: Db) {
  return db
    .select()
    .from(schema.aiProviders)
    .orderBy(asc(schema.aiProviders.createdAt));
}

export async function getDefaultAiProvider(db: Db) {
  const [provider] = await db
    .select()
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.isDefault, true))
    .limit(1);
  return provider ?? null;
}

// ── Untagged cards tagger helpers ──

export async function getUntaggedCardsByBundle(db: Db, bundleId: number) {
  // Get all card IDs in bundle
  const bundleCardRows = await db
    .select({
      cardId: schema.bundleCards.cardId,
      order: schema.bundleCards.order,
    })
    .from(schema.bundleCards)
    .where(eq(schema.bundleCards.bundleId, bundleId))
    .orderBy(asc(schema.bundleCards.order));

  if (bundleCardRows.length === 0) return [];

  const cardIds = bundleCardRows.map((r) => r.cardId);

  // Get all cardIds that already have at least one tag
  const taggedRows = await db
    .select({ cardId: schema.cardTags.cardId })
    .from(schema.cardTags)
    .where(inArray(schema.cardTags.cardId, cardIds));

  const taggedSet = new Set(taggedRows.map((r) => r.cardId));

  // Filter to untagged cards
  const untaggedIds = cardIds.filter((id) => !taggedSet.has(id));

  if (untaggedIds.length === 0) return [];

  // Fetch the full card data for untagged cards
  const untaggedCards = await db
    .select()
    .from(schema.cards)
    .where(inArray(schema.cards.id, untaggedIds))
    .orderBy(asc(schema.cards.createdAt));

  return untaggedCards;
}

export async function addTagsToCard(db: Db, cardId: number, tagIds: number[]) {
  if (tagIds.length === 0) return;
  await db.insert(schema.cardTags).values(
    tagIds.map((tagId) => ({ cardId, tagId })),
  );
  await persistNow();
}

// ── Get cards by tag/bundle ──

export async function getCardsByTag(db: Db, tagId: number) {
  return db
    .select()
    .from(schema.cards)
    .innerJoin(schema.cardTags, eq(schema.cards.id, schema.cardTags.cardId))
    .where(eq(schema.cardTags.tagId, tagId))
    .orderBy(asc(schema.cards.createdAt));
}

export async function getCardsByBundle(db: Db, bundleId: number) {
  return db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, bundleId))
    .orderBy(asc(schema.bundleCards.order));
}

// ── Get tags for a card ──

export async function getCardTags(db: Db, cardId: number) {
  return db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
    })
    .from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .where(eq(schema.cardTags.cardId, cardId));
}

// ── Get bundles for a card ──

export async function getCardBundles(db: Db, cardId: number) {
  return db
    .select({
      id: schema.bundles.id,
      title: schema.bundles.title,
    })
    .from(schema.bundleCards)
    .innerJoin(schema.bundles, eq(schema.bundleCards.bundleId, schema.bundles.id))
    .where(eq(schema.bundleCards.cardId, cardId));
}

// ── Bundle exam statistics ──

export async function getBundleExamStats(db: Db, bundleId: number) {
  const bundleExams = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId))
    .orderBy(asc(schema.exams.createdAt));

  if (bundleExams.length === 0) {
    return {
      exams: [],
      attempts: [],
      totalAttempts: 0,
      completedAttempts: 0,
      avgScore: 0,
      bestScore: 0,
      worstScore: 0,
      totalTimeSeconds: 0,
    };
  }

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(asc(schema.examAttempts.startedAt));

  const completed = attempts.filter((a) => a.attempt.completedAt != null);

  // All scores: unfinished attempts count as 0
  const allScores = attempts.map((a) => (a.attempt.completedAt != null ? (a.attempt.score ?? 0) : 0));

  const totalTimeSeconds = completed.reduce((sum, a) => {
    if (!a.attempt.completedAt || !a.attempt.startedAt) return sum;
    return sum + Math.round((a.attempt.completedAt - a.attempt.startedAt) / 1000);
  }, 0);

  return {
    exams: bundleExams,
    attempts,
    totalAttempts: attempts.length,
    completedAttempts: completed.length,
    avgScore: allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0,
    bestScore: allScores.length > 0 ? Math.max(...allScores) : 0,
    worstScore: allScores.length > 0 ? Math.min(...allScores) : 0,
    totalTimeSeconds,
  };
}

export async function getBundlePastAttempts(db: Db, bundleId: number) {
  const bundleExams = await db
    .select({ id: schema.exams.id })
    .from(schema.exams)
    .where(eq(schema.exams.bundleId, bundleId));

  if (bundleExams.length === 0) return [];

  const examIds = bundleExams.map((e) => e.id);

  const attempts = await db
    .select({
      attempt: schema.examAttempts,
      exam: schema.exams,
    })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(inArray(schema.examAttempts.examId, examIds))
    .orderBy(sql`${schema.examAttempts.startedAt} DESC`);

  return attempts;
}

export async function getBundleCardWeakness(db: Db, bundleId: number) {
  const cardsInBundle = await db
    .select()
    .from(schema.bundleCards)
    .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
    .where(eq(schema.bundleCards.bundleId, bundleId));

  if (cardsInBundle.length === 0) return [];

  const cardIds = cardsInBundle.map((r) => r.cards.id);

  // Total graded answers per card (exclude ungraded / open answers where isCorrect is NULL)
  const totalAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      total: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        sql`${schema.examAnswers.isCorrect} IS NOT NULL`,
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  // Incorrect answers per card
  const incorrectAnswers = await db
    .select({
      cardId: schema.examAnswers.cardId,
      incorrect: sql<number>`COUNT(*)`,
    })
    .from(schema.examAnswers)
    .innerJoin(schema.examAttempts, eq(schema.examAnswers.attemptId, schema.examAttempts.id))
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(
      and(
        eq(schema.exams.bundleId, bundleId),
        inArray(schema.examAnswers.cardId, cardIds),
        eq(schema.examAnswers.isCorrect, false),
      ),
    )
    .groupBy(schema.examAnswers.cardId);

  const totalMap = new Map(totalAnswers.map((r) => [r.cardId, r.total]));
  const incorrectMap = new Map(incorrectAnswers.map((r) => [r.cardId, r.incorrect]));
  const cardMap = new Map(cardsInBundle.map((r) => [r.cards.id, r.cards]));

  return cardsInBundle
    .map((r) => {
      const total = totalMap.get(r.cards.id) ?? 0;
      const incorrect = incorrectMap.get(r.cards.id) ?? 0;
      return {
        card: r.cards,
        total,
        incorrect,
        correct: total - incorrect,
        incorrectRate: total > 0 ? incorrect / total : 0,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.incorrectRate - a.incorrectRate);
}
