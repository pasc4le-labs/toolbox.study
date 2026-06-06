import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createAiProvider,
  updateAiProvider,
  deleteAiProvider,
  getAllAiProviders,
  getDefaultAiProvider,
} from "@/lib/services/ai-provider";
import { createTestDb, destroyTestDb, type TestDbHandle } from "@/__tests__/helpers/test-db";

describe("ai-provider service", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(() => {
    destroyTestDb(handle);
  });

  describe("createAiProvider", () => {
    it("creates a provider with sensible defaults", async () => {
      const provider = await createAiProvider(handle.db, {
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-4o-mini",
      });

      expect(provider?.id).toBeGreaterThan(0);
      expect(provider?.name).toBe("OpenAI");
      expect(provider?.baseUrl).toBe("https://api.openai.com/v1");
      expect(provider?.modelId).toBe("gpt-4o-mini");
      expect(provider?.providerType).toBe("openai-compatible");
      expect(provider?.isDefault).toBe(false);
    });

    it("sets a provider as default and unsets others", async () => {
      const a = await createAiProvider(handle.db, {
        name: "A",
        baseUrl: "u",
        modelId: "m",
        isDefault: true,
      });
      const b = await createAiProvider(handle.db, {
        name: "B",
        baseUrl: "u",
        modelId: "m",
        isDefault: true,
      });

      expect(a?.isDefault).toBe(true);
      expect(b?.isDefault).toBe(true);

      const all = await getAllAiProviders(handle.db);
      const aRow = all.find((p) => p.id === a?.id);
      const bRow = all.find((p) => p.id === b?.id);
      expect(aRow?.isDefault).toBe(false);
      expect(bRow?.isDefault).toBe(true);
    });
  });

  describe("updateAiProvider", () => {
    it("updates specified fields", async () => {
      const p = await createAiProvider(handle.db, {
        name: "Old",
        baseUrl: "u",
        modelId: "m",
      });
      await updateAiProvider(handle.db, p.id, { apiKey: "new-key", modelId: "new-model" });

      const all = await getAllAiProviders(handle.db);
      const updated = all.find((row) => row.id === p.id);
      expect(updated?.apiKey).toBe("new-key");
      expect(updated?.modelId).toBe("new-model");
      expect(updated?.name).toBe("Old");
    });

    it("promoting to default unsets the previous default", async () => {
      const a = await createAiProvider(handle.db, {
        name: "A",
        baseUrl: "u",
        modelId: "m",
        isDefault: true,
      });
      const b = await createAiProvider(handle.db, {
        name: "B",
        baseUrl: "u",
        modelId: "m",
      });

      await updateAiProvider(handle.db, b.id, { isDefault: true });

      const all = await getAllAiProviders(handle.db);
      const aRow = all.find((p) => p.id === a.id);
      const bRow = all.find((p) => p.id === b.id);
      expect(aRow?.isDefault).toBe(false);
      expect(bRow?.isDefault).toBe(true);
    });
  });

  describe("deleteAiProvider", () => {
    it("removes the provider", async () => {
      const p = await createAiProvider(handle.db, {
        name: "X",
        baseUrl: "u",
        modelId: "m",
      });
      await deleteAiProvider(handle.db, p.id);
      const all = await getAllAiProviders(handle.db);
      expect(all).toEqual([]);
    });
  });

  describe("getAllAiProviders", () => {
    it("returns providers ordered by createdAt ascending", async () => {
      const a = await createAiProvider(handle.db, { name: "A", baseUrl: "u", modelId: "m" });
      const b = await createAiProvider(handle.db, { name: "B", baseUrl: "u", modelId: "m" });
      const c = await createAiProvider(handle.db, { name: "C", baseUrl: "u", modelId: "m" });
      const all = await getAllAiProviders(handle.db);
      expect(all.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    });
  });

  describe("getDefaultAiProvider", () => {
    it("returns the default provider", async () => {
      const a = await createAiProvider(handle.db, { name: "A", baseUrl: "u", modelId: "m" });
      const b = await createAiProvider(handle.db, {
        name: "B",
        baseUrl: "u",
        modelId: "m",
        isDefault: true,
      });

      const def = await getDefaultAiProvider(handle.db);
      expect(def?.id).toBe(b.id);
      expect(def?.id).not.toBe(a.id);
    });

    it("returns null when no default", async () => {
      await createAiProvider(handle.db, { name: "A", baseUrl: "u", modelId: "m" });
      const def = await getDefaultAiProvider(handle.db);
      expect(def).toBeNull();
    });
  });
});
