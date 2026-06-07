import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store: Record<string, string> = {};

vi.stubGlobal("window", {});

vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
});

import {
  storeSyncKey,
  loadSyncKey,
  deleteSyncKey,
  storeLastSyncedAt,
  loadLastSyncedAt,
  getOrCreateDeviceId,
} from "@/lib/sync-storage";

describe("sync-storage", () => {
  beforeEach(() => {
    for (const k in store) delete store[k];
  });

  it("storeSyncKey / loadSyncKey: store a mnemonic, load it, assert equality", () => {
    const mnemonic = "test mnemonic words";
    storeSyncKey(mnemonic);
    expect(localStorage.setItem).toHaveBeenCalledWith('sync-mnemonic', mnemonic);
    expect(loadSyncKey()).toBe(mnemonic);
  });

  it("deleteSyncKey: store then delete, assert loadSyncKey returns null", () => {
    storeSyncKey("test mnemonic");
    deleteSyncKey();
    expect(localStorage.removeItem).toHaveBeenCalledWith('sync-mnemonic');
    expect(localStorage.removeItem).toHaveBeenCalledWith('sync-last-synced');
    expect(loadSyncKey()).toBeNull();
  });

  it("getOrCreateDeviceId: first call generates UUID, second call returns same UUID", () => {
    const id1 = getOrCreateDeviceId();
    const id2 = getOrCreateDeviceId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("storeLastSyncedAt / loadLastSyncedAt: store timestamp, load it, assert equality", () => {
    const timestamp = Date.now();
    storeLastSyncedAt(timestamp);
    expect(localStorage.setItem).toHaveBeenCalledWith('sync-last-synced', String(timestamp));
    expect(loadLastSyncedAt()).toBe(timestamp);
  });

  it("loadLastSyncedAt returns null when not set", () => {
    expect(loadLastSyncedAt()).toBeNull();
  });
});