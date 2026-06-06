import { describe, it, expect } from "vitest";
import {
  chunkPayload,
  reassembleChunks,
  CHUNK_SIZE,
  type TransferChunk,
  type TransferStart,
  type TransferComplete,
  type ExchangeMessage,
} from "@/lib/exchange-protocol";

describe("exchange-protocol", () => {
  describe("CHUNK_SIZE", () => {
    it("equals 16 * 1024", () => {
      expect(CHUNK_SIZE).toBe(16 * 1024);
    });
  });

  describe("chunkPayload", () => {
    it("returns one chunk for a string shorter than CHUNK_SIZE", () => {
      const chunks = chunkPayload("hello");
      expect(chunks).toEqual(["hello"]);
    });

    it("returns one chunk for a string exactly equal to CHUNK_SIZE", () => {
      const payload = "a".repeat(CHUNK_SIZE);
      const chunks = chunkPayload(payload);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(payload);
    });

    it("returns two chunks for a string 1.5x CHUNK_SIZE", () => {
      const payload = "a".repeat(CHUNK_SIZE + CHUNK_SIZE / 2);
      const chunks = chunkPayload(payload);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(CHUNK_SIZE);
      expect(chunks[1]).toHaveLength(CHUNK_SIZE / 2);
    });

    it("splits strings longer than CHUNK_SIZE into N chunks", () => {
      const payload = "a".repeat(CHUNK_SIZE * 3 + 17);
      const chunks = chunkPayload(payload);
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toHaveLength(CHUNK_SIZE);
      expect(chunks[1]).toHaveLength(CHUNK_SIZE);
      expect(chunks[2]).toHaveLength(CHUNK_SIZE);
      expect(chunks[3]).toHaveLength(17);
    });

    it("returns an empty array for empty string", () => {
      expect(chunkPayload("")).toEqual([]);
    });
  });

  describe("reassembleChunks", () => {
    it("reconstructs the original string from chunks", () => {
      const original = "hello world";
      expect(reassembleChunks(chunkPayload(original))).toBe(original);
    });
  });

  describe("round-trip", () => {
    const sizes = [
      ["empty", ""],
      ["small", "x"],
      ["exactly CHUNK_SIZE", "y".repeat(CHUNK_SIZE)],
      ["CHUNK_SIZE + 1", "z".repeat(CHUNK_SIZE + 1)],
      ["2x CHUNK_SIZE", "w".repeat(CHUNK_SIZE * 2)],
      ["2x CHUNK_SIZE + 1", "q".repeat(CHUNK_SIZE * 2 + 1)],
      ["non-round multiple", "r".repeat(CHUNK_SIZE * 5 + 1234)],
    ] as const;

    for (const [label, payload] of sizes) {
      it(`reassembles ${label} correctly`, () => {
        expect(reassembleChunks(chunkPayload(payload))).toBe(payload);
      });
    }
  });
});
