import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { Rating } from "ts-fsrs";
import { eq } from "drizzle-orm";
import {
  createCard,
  getCardById,
  getCardsByTag,
  getCardsByBundle,
} from "@/lib/services/card";
import { createTag } from "@/lib/services/tag";
import { createBundle, addCardsToBundle } from "@/lib/services/bundle";
import {
  getOrCreateCardFsrs,
  rateCard,
  getDueCards,
} from "@/lib/services/fsrs";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import * as schema from "@/db/schema";

describe("integration: card-FSRS lifecycle", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  it("createCard auto-creates an FSRS entry in the New state", async () => {
    const card = await createCard(handle.db, {
      type: "knowledge",
      front: "Q",
      back: "A",
    });

    const fsrs = await getOrCreateCardFsrs(handle.db, card.id);
    expect(fsrs.state).toBe(0); // State.New
    expect(fsrs.reps).toBe(0);
    expect(fsrs.lapses).toBe(0);
  });

  it("newly created cards are due immediately", async () => {
    const c1 = await createCard(handle.db, { type: "knowledge", front: "1", back: "A" });
    const c2 = await createCard(handle.db, { type: "knowledge", front: "2", back: "A" });

    const due = await getDueCards(handle.db);
    expect(due).toHaveLength(2);
    expect(due.map((d) => d.cards.id).sort()).toEqual([c1.id, c2.id].sort());
  });

  it("rateCard Good transitions state out of New and increments reps", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });

    const { card: updated } = await rateCard(handle.db, card.id, Rating.Good);

    expect(updated.reps).toBe(1);
    expect(updated.state).not.toBe(0); // no longer New

    // The persistent state matches
    const persisted = await getOrCreateCardFsrs(handle.db, card.id);
    expect(persisted.reps).toBe(1);
    expect(persisted.state).toBe(updated.state);
  });

  it("rateCard Again on a card already in Review increments lapses", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });

    // Promote to Review with two Goods
    await rateCard(handle.db, card.id, Rating.Good);
    await rateCard(handle.db, card.id, Rating.Good);
    const { card: afterPromote } = await rateCard(handle.db, card.id, Rating.Good);
    expect(afterPromote.state).toBe(2); // State.Review

    // Now lapse
    const { card: afterLapse } = await rateCard(handle.db, card.id, Rating.Again);
    expect(afterLapse.lapses).toBe(1);
    expect(afterLapse.state).toBe(3); // State.Relearning
  });

  it("multiple ratings accumulate reps across the lifecycle", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });

    for (let i = 0; i < 4; i++) {
      await rateCard(handle.db, card.id, Rating.Good);
    }

    const persisted = await getOrCreateCardFsrs(handle.db, card.id);
    expect(persisted.reps).toBe(4);
  });

  it("rating a card pushes its due date out of the due list", async () => {
    const c1 = await createCard(handle.db, { type: "knowledge", front: "rate-me", back: "A" });
    const c2 = await createCard(handle.db, { type: "knowledge", front: "leave-me", back: "A" });

    // Rate c1 with Good (Easy would push further but Good is enough to leave "now")
    await rateCard(handle.db, c1.id, Rating.Good);

    const due = await getDueCards(handle.db);
    const dueIds = due.map((d) => d.cards.id);
    expect(dueIds).toContain(c2.id);
    expect(dueIds).not.toContain(c1.id);
  });

  it("Easy rating moves due date far into the future", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
    const before = Date.now();

    const { card: updated } = await rateCard(handle.db, card.id, Rating.Easy);

    // Easy should schedule days into the future
    expect(updated.scheduled_days).toBeGreaterThan(0);
    expect(updated.due.getTime()).toBeGreaterThan(before);
  });

  it("getDueCards with tagId filter: only due cards with that tag are returned", async () => {
    const tag = await createTag(handle.db, "bio");
    const tagged1 = await createCard(handle.db, {
      type: "knowledge",
      front: "tagged-1",
      back: "A",
      tagIds: [tag.id],
    });
    const tagged2 = await createCard(handle.db, {
      type: "knowledge",
      front: "tagged-2",
      back: "A",
      tagIds: [tag.id],
    });
    const untagged = await createCard(handle.db, {
      type: "knowledge",
      front: "untagged",
      back: "A",
    });

    const due = await getDueCards(handle.db, { tagId: tag.id });
    const ids = due.map((d) => d.cards.id);
    expect(ids).toContain(tagged1.id);
    expect(ids).toContain(tagged2.id);
    expect(ids).not.toContain(untagged.id);
  });

  it("getDueCards with bundleId filter: only due cards in that bundle are returned", async () => {
    const bundle = await createBundle(handle.db, { title: "B" });
    const inBundle = await createCard(handle.db, {
      type: "knowledge",
      front: "in",
      back: "A",
    });
    const outOfBundle = await createCard(handle.db, {
      type: "knowledge",
      front: "out",
      back: "A",
    });
    await addCardsToBundle(handle.db, bundle.id, [inBundle.id]);

    const due = await getDueCards(handle.db, { bundleId: bundle.id });
    const ids = due.map((d) => d.cards.id);
    expect(ids).toContain(inBundle.id);
    expect(ids).not.toContain(outOfBundle.id);
  });

  it("getDueCards combines tagId and bundleId filters (intersection)", async () => {
    const tag = await createTag(handle.db, "topic");
    const bundle = await createBundle(handle.db, { title: "B" });

    // In bundle + tagged
    const match = await createCard(handle.db, {
      type: "knowledge",
      front: "match",
      back: "A",
      tagIds: [tag.id],
    });
    await addCardsToBundle(handle.db, bundle.id, [match.id]);

    // Tagged but not in bundle
    await createCard(handle.db, {
      type: "knowledge",
      front: "tagged-no-bundle",
      back: "A",
      tagIds: [tag.id],
    });

    // In bundle but not tagged
    const bundleOnly = await createCard(handle.db, {
      type: "knowledge",
      front: "bundle-no-tag",
      back: "A",
    });
    await addCardsToBundle(handle.db, bundle.id, [bundleOnly.id]);

    const due = await getDueCards(handle.db, {
      tagId: tag.id,
      bundleId: bundle.id,
    });
    const ids = due.map((d) => d.cards.id);
    expect(ids).toEqual([match.id]);
  });

  it("deleting a card cascades to its FSRS entry", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });
    await rateCard(handle.db, card.id, Rating.Good);

    // Sanity: FSRS entry exists
    const before = await handle.db
      .select()
      .from(schema.cardFsrs)
      .where(eq(schema.cardFsrs.cardId, card.id));
    expect(before).toHaveLength(1);

    // Delete the card via service layer
    await handle.db.delete(schema.cards).where(eq(schema.cards.id, card.id));

    const after = await handle.db
      .select()
      .from(schema.cardFsrs)
      .where(eq(schema.cardFsrs.cardId, card.id));
    expect(after).toHaveLength(0);

    // And getCardById returns null
    expect(await getCardById(handle.db, card.id)).toBeNull();
  });

  it("review log accumulates one entry per rateCard call", async () => {
    const card = await createCard(handle.db, { type: "knowledge", front: "Q", back: "A" });

    await rateCard(handle.db, card.id, Rating.Good);
    await rateCard(handle.db, card.id, Rating.Easy);
    await rateCard(handle.db, card.id, Rating.Hard);

    const logs = await handle.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.cardId, card.id));

    expect(logs).toHaveLength(3);
    expect(logs.map((l) => l.rating).sort()).toEqual(
      [Rating.Good, Rating.Easy, Rating.Hard].sort(),
    );
  });

  it("rateCard respects bundle-scoped due card filtering end-to-end", async () => {
    // Two bundles, each with two cards. Rate the cards in bundle A.
    const a = await createBundle(handle.db, { title: "A" });
    const b = await createBundle(handle.db, { title: "B" });
    const a1 = await createCard(handle.db, { type: "knowledge", front: "a1", back: "A" });
    const a2 = await createCard(handle.db, { type: "knowledge", front: "a2", back: "A" });
    const b1 = await createCard(handle.db, { type: "knowledge", front: "b1", back: "A" });
    const b2 = await createCard(handle.db, { type: "knowledge", front: "b2", back: "A" });
    await addCardsToBundle(handle.db, a.id, [a1.id, a2.id]);
    await addCardsToBundle(handle.db, b.id, [b1.id, b2.id]);

    // Rate bundle A's cards
    await rateCard(handle.db, a1.id, Rating.Good);
    await rateCard(handle.db, a2.id, Rating.Good);

    const dueFromA = await getDueCards(handle.db, { bundleId: a.id });
    const dueFromB = await getDueCards(handle.db, { bundleId: b.id });

    expect(dueFromA.map((d) => d.cards.id)).toEqual([]);
    expect(dueFromB.map((d) => d.cards.id).sort()).toEqual([b1.id, b2.id].sort());

    // Sanity: getCardsByBundle returns the right membership
    const aCards = await getCardsByBundle(handle.db, a.id);
    const bCards = await getCardsByBundle(handle.db, b.id);
    expect(aCards.map((c) => c.cards.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(bCards.map((c) => c.cards.id).sort()).toEqual([b1.id, b2.id].sort());
  });

  it("getCardsByTag returns only cards with the given tag (cross-service read)", async () => {
    const tag = await createTag(handle.db, "x");
    const c1 = await createCard(handle.db, { type: "knowledge", front: "1", back: "A", tagIds: [tag.id] });
    await createCard(handle.db, { type: "knowledge", front: "2", back: "A" });

    const result = await getCardsByTag(handle.db, tag.id);
    const ids = result.map((r) => r.cards.id);
    expect(ids).toEqual([c1.id]);
  });
});
