import { describe, it, expect } from "vitest";
import {
  generateSyncKey,
  validateSyncKey,
  mnemonicToRoomId,
  normalizeMnemonic,
} from "@/lib/sync-identity";

describe("sync-identity", () => {
  it("generateSyncKey returns a string with exactly 12 space-separated words", () => {
    const key = generateSyncKey();
    const words = key.split(" ");
    expect(words).toHaveLength(12);
    expect(key).toBe(key.toLowerCase());
  });

  it("validateSyncKey returns true for a valid generated mnemonic", () => {
    const key = generateSyncKey();
    expect(validateSyncKey(key)).toBe(true);
  });

  it("validateSyncKey returns false for invalid input", () => {
    expect(validateSyncKey("hello world foo bar")).toBe(false);
  });

  it("validateSyncKey returns false for 11 words", () => {
    const words = generateSyncKey().split(" ").slice(0, 11).join(" ");
    expect(validateSyncKey(words)).toBe(false);
  });

  it("validateSyncKey returns false for 13 words", () => {
    const words = generateSyncKey().split(" ").concat(["extra"]).join(" ");
    expect(validateSyncKey(words)).toBe(false);
  });

  it("mnemonicToRoomId returns a 16-character hex string", async () => {
    const key = generateSyncKey();
    const roomId = await mnemonicToRoomId(key);
    expect(roomId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("mnemonicToRoomId is deterministic — same mnemonic produces same room ID", async () => {
    const key = generateSyncKey();
    const id1 = await mnemonicToRoomId(key);
    const id2 = await mnemonicToRoomId(key);
    expect(id1).toBe(id2);
  });

  it("normalizeMnemonic trims, lowercases, and collapses whitespace", () => {
    const result = normalizeMnemonic("  HELLO   WORLD  Foo  ");
    expect(result).toBe("hello world foo");
  });
});
