import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ── Card Types ──
// 'multi_radio' | 'multi_select' | 'open' | 'knowledge'

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['multi_radio', 'multi_select', 'open', 'knowledge'] }).notNull(),
  front: text('front').notNull(),        // question / prompt
  back: text('back').notNull(),          // answer / response
  explanation: text('explanation'),      // optional explanation
  options: text('options'),              // JSON: string[] for multi_radio / multi_select. null for open/knowledge.
  correctIndices: text('correct_indices'), // JSON: number[] — indices of correct options. null for open/knowledge.
  createdAt: integer('created_at').notNull().default(Date.now()),
  updatedAt: integer('updated_at').notNull().default(Date.now()),
});

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

// Tag table (normalized)
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// Card ↔ Tags (many-to-many)
export const cardTags = sqliteTable(
  'card_tags',
  {
    cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.tagId] }),
  ],
);

export type CardTag = typeof cardTags.$inferSelect;
export type NewCardTag = typeof cardTags.$inferInsert;

// Bundles
export const bundles = sqliteTable('bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Bundle = typeof bundles.$inferSelect;
export type NewBundle = typeof bundles.$inferInsert;

// Bundle ↔ Cards (many-to-many, preserves order)
export const bundleCards = sqliteTable(
  'bundle_cards',
  {
    cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    bundleId: integer('bundle_id').notNull().references(() => bundles.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.bundleId] }),
  ],
);

export type BundleCard = typeof bundleCards.$inferSelect;
export type NewBundleCard = typeof bundleCards.$inferInsert;

// FSRS card state (1:1 with cards)
export const cardFsrs = sqliteTable('card_fsrs', {
  cardId: integer('card_id').primaryKey().references(() => cards.id, { onDelete: 'cascade' }),
  difficulty: real('difficulty').notNull().default(0),
  stability: real('stability').notNull().default(0),
  state: integer('state').notNull().default(0),  // State.New=0, Learning=1, Review=2, Relearning=3
  due: integer('due').notNull().default(Date.now()),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  lastReview: integer('last_review'),
  learningSteps: integer('learning_steps').notNull().default(0),
});

export type CardFsrs = typeof cardFsrs.$inferSelect;
export type NewCardFsrs = typeof cardFsrs.$inferInsert;

// Review logs
export const reviewLogs = sqliteTable('review_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),  // Rating.Again=1, Hard=2, Good=3, Easy=4
  state: integer('state').notNull(),
  due: integer('due').notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  elapsedDays: integer('elapsed_days').notNull(),
  lastElapsedDays: integer('last_elapsed_days').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  review: integer('review').notNull(),  // timestamp
  learningSteps: integer('learning_steps').notNull().default(0),
});

export type ReviewLog = typeof reviewLogs.$inferSelect;
export type NewReviewLog = typeof reviewLogs.$inferInsert;

// Exams
export const exams = sqliteTable('exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  bundleId: integer('bundle_id').references(() => bundles.id, { onDelete: 'cascade' }),
  questionCount: integer('question_count').notNull(),
  timeLimitSeconds: integer('time_limit_seconds'),    // null = no timer
  difficultyFilter: real('difficulty_filter'),          // 0-1 slider: % of low-scoring cards to include. null = random.
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;

// Exam attempts (tracks a single session of taking an exam)
export const examAttempts = sqliteTable('exam_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  examId: integer('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  score: real('score'),  // 0-1, computed at completion
});

export type ExamAttempt = typeof examAttempts.$inferSelect;
export type NewExamAttempt = typeof examAttempts.$inferInsert;

// Exam attempt answers (one per card in the exam)
export const examAnswers = sqliteTable('exam_answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attemptId: integer('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  // For multi_radio: the chosen index; multi_select: JSON number[]; open: null (not auto-graded)
  answer: text('answer'),
  isCorrect: integer('is_correct', { mode: 'boolean' }),
});

export type ExamAnswer = typeof examAnswers.$inferSelect;
export type NewExamAnswer = typeof examAnswers.$inferInsert;

// AI Provider configs (stored in client-side DB for BYOK)
export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),          // e.g. "OpenAI", "Ollama"
  providerType: text('provider_type', { enum: ['openai-compatible', 'google', 'anthropic'] }).notNull().default('openai-compatible'),
  baseUrl: text('base_url').notNull(),     // e.g. "https://api.openai.com/v1"
  apiKey: text('api_key'),
  modelId: text('model_id').notNull(),     // e.g. "gpt-4o-mini"
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type AiProvider = typeof aiProviders.$inferSelect;
export type NewAiProvider = typeof aiProviders.$inferInsert;

// Keep legacy todos
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;

// ── Relations ──

export const cardsRelations = relations(cards, ({ many, one }) => ({
  tags: many(cardTags),
  bundles: many(bundleCards),
  fsrs: one(cardFsrs, {
    fields: [cards.id],
    references: [cardFsrs.cardId],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  cards: many(cardTags),
}));

export const cardTagsRelations = relations(cardTags, ({ one }) => ({
  card: one(cards, {
    fields: [cardTags.cardId],
    references: [cards.id],
  }),
  tag: one(tags, {
    fields: [cardTags.tagId],
    references: [tags.id],
  }),
}));

export const bundlesRelations = relations(bundles, ({ many }) => ({
  cards: many(bundleCards),
  exams: many(exams),
}));

export const bundleCardsRelations = relations(bundleCards, ({ one }) => ({
  card: one(cards, {
    fields: [bundleCards.cardId],
    references: [cards.id],
  }),
  bundle: one(bundles, {
    fields: [bundleCards.bundleId],
    references: [bundles.id],
  }),
}));

export const cardFsrsRelations = relations(cardFsrs, ({ one }) => ({
  card: one(cards, {
    fields: [cardFsrs.cardId],
    references: [cards.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  bundle: one(bundles, {
    fields: [exams.bundleId],
    references: [bundles.id],
  }),
  attempts: many(examAttempts),
}));

export const examAttemptsRelations = relations(examAttempts, ({ one, many }) => ({
  exam: one(exams, {
    fields: [examAttempts.examId],
    references: [exams.id],
  }),
  answers: many(examAnswers),
}));

export const examAnswersRelations = relations(examAnswers, ({ one }) => ({
  attempt: one(examAttempts, {
    fields: [examAnswers.attemptId],
    references: [examAttempts.id],
  }),
  card: one(cards, {
    fields: [examAnswers.cardId],
    references: [cards.id],
  }),
}));
