import { describe, it, expect } from "vitest";
import { createTestDb, destroyTestDb } from "./test-db";
import * as schema from "@/db/schema";

describe("createTestDb", () => {
  it("returns a working DB instance with all tables", async () => {
    const handle = await createTestDb();

    try {
      const tables = handle.sqlDb.exec(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      const tableNames = tables[0]?.values.flat() ?? [];
      expect(tableNames).toContain("cards");
      expect(tableNames).toContain("tags");
      expect(tableNames).toContain("bundles");
      expect(tableNames).toContain("card_tags");
      expect(tableNames).toContain("bundle_cards");
      expect(tableNames).toContain("card_fsrs");
      expect(tableNames).toContain("review_logs");
      expect(tableNames).toContain("exams");
      expect(tableNames).toContain("exam_attempts");
      expect(tableNames).toContain("exam_answers");
      expect(tableNames).toContain("exam_questions");
      expect(tableNames).toContain("ai_providers");
    } finally {
      destroyTestDb(handle);
    }
  });

  it("supports insert/select round-trip", async () => {
    const handle = await createTestDb();

    try {
      const now = Date.now();
      await handle.db.insert(schema.cards).values({
        type: "knowledge",
        front: "Test question",
        back: "Test answer",
        createdAt: now,
        updatedAt: now,
      });

      const rows = await handle.db.select().from(schema.cards);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.front).toBe("Test question");
      expect(rows[0]?.back).toBe("Test answer");
      expect(rows[0]?.type).toBe("knowledge");
    } finally {
      destroyTestDb(handle);
    }
  });

  it("provides an isolated DB per call", async () => {
    const a = await createTestDb();
    const b = await createTestDb();

    try {
      const now = Date.now();
      await a.db.insert(schema.cards).values({
        type: "knowledge",
        front: "A",
        back: "A",
        createdAt: now,
        updatedAt: now,
      });

      const aCards = await a.db.select().from(schema.cards);
      const bCards = await b.db.select().from(schema.cards);

      expect(aCards).toHaveLength(1);
      expect(bCards).toHaveLength(0);
    } finally {
      destroyTestDb(a);
      destroyTestDb(b);
    }
  });
});
