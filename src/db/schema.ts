import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ── Cards ──
export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  front: text('front').notNull(),
  back: text('back').notNull(),
  explanation: text('explanation'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

// ── Card Tags ──
export const cardTags = sqliteTable(
  'card_tags',
  {
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cardId, table.tag] }),
  }),
);

export type CardTag = typeof cardTags.$inferSelect;
export type NewCardTag = typeof cardTags.$inferInsert;

// ── Bundles (groups of cards, e.g. exams) ──
export const bundles = sqliteTable('bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Bundle = typeof bundles.$inferSelect;
export type NewBundle = typeof bundles.$inferInsert;

// ── Bundle ↔ Cards join table ──
export const bundleCards = sqliteTable(
  'bundle_cards',
  {
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    bundleId: integer('bundle_id')
      .notNull()
      .references(() => bundles.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cardId, table.bundleId] }),
  }),
);

export type BundleCard = typeof bundleCards.$inferSelect;
export type NewBundleCard = typeof bundleCards.$inferInsert;

// ── Relations ──

export const cardsRelations = relations(cards, ({ many }) => ({
  tags: many(cardTags),
  bundles: many(bundleCards),
}));

export const cardTagsRelations = relations(cardTags, ({ one }) => ({
  card: one(cards, {
    fields: [cardTags.cardId],
    references: [cards.id],
  }),
}));

export const bundlesRelations = relations(bundles, ({ many }) => ({
  cards: many(bundleCards),
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

// ── Keep existing todos (legacy) ──
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
