import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/db", () => ({ persistNow: vi.fn() }));

import { exportFullSnapshot, countSnapshotRecords } from "@/lib/sync-serialize";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";
import { createCard, createTag } from "@/lib/services";

describe("sync-serialize", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  it("exportFullSnapshot on an empty DB returns a snapshot with all arrays empty", async () => {
    const snapshot = await exportFullSnapshot(handle.db, "test-device");
    expect(snapshot.version).toBe(1);
    expect(snapshot.deviceId).toBe("test-device");
    expect(snapshot.cards).toEqual([]);
    expect(snapshot.tags).toEqual([]);
    expect(snapshot.cardTags).toEqual([]);
    expect(snapshot.bundles).toEqual([]);
    expect(snapshot.bundleCards).toEqual([]);
    expect(snapshot.cardFsrs).toEqual([]);
    expect(snapshot.reviewLogs).toEqual([]);
    expect(snapshot.exams).toEqual([]);
    expect(snapshot.examAttempts).toEqual([]);
    expect(snapshot.examAnswers).toEqual([]);
    expect(snapshot.examQuestions).toEqual([]);
    expect(snapshot.todos).toEqual([]);
    expect(typeof snapshot.exportedAt).toBe("number");
  });

  it("exportFullSnapshot on a populated DB includes cards and tags", async () => {
    const tag = await createTag(handle.db, "biology");
    await createCard(handle.db, {
      type: "knowledge",
      front: "What is DNA?",
      back: "Deoxyribonucleic acid",
      tagIds: [tag.id],
    });

    const snapshot = await exportFullSnapshot(handle.db, "test-device");
    expect(snapshot.cards).toHaveLength(1);
    expect(snapshot.tags).toHaveLength(1);
    expect(snapshot.cardTags).toHaveLength(1);
  });

  it("countSnapshotRecords counts cards + tags + bundles + exams + reviewLogs + examAttempts", async () => {
    const tag = await createTag(handle.db, "physics");
    await createCard(handle.db, {
      type: "knowledge",
      front: "What is gravity?",
      back: "A force",
      tagIds: [tag.id],
    });

    const snapshot = await exportFullSnapshot(handle.db, "test-device");
    const count = countSnapshotRecords(snapshot);
    expect(count).toBe(2); // 1 card + 1 tag
  });
});
