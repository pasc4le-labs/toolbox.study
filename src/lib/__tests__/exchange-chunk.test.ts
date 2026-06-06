import { describe, it, expect } from "vitest";
import {
  createTransferMessages,
} from "@/lib/exchange-chunk";
import {
  CHUNK_SIZE,
  chunkPayload,
  reassembleChunks,
} from "@/lib/exchange-protocol";

describe("createTransferMessages", () => {
  it("returns [TransferStart(0), TransferComplete] for empty string", () => {
    const messages = createTransferMessages("");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: "transfer_start", totalChunks: 0 });
    expect(messages[1]).toEqual({ type: "transfer_complete" });
  });

  it("first message is TransferStart, last is TransferComplete for short payload", () => {
    const messages = createTransferMessages("hello");
    expect(messages[0]?.type).toBe("transfer_start");
    expect(messages[messages.length - 1]?.type).toBe("transfer_complete");
    // total messages = 1 (start) + 1 (chunk) + 1 (complete) = 3
    expect(messages).toHaveLength(3);
  });

  it("total chunk count matches TransferStart.totalChunks", () => {
    const payload = "a".repeat(CHUNK_SIZE * 3 + 5);
    const messages = createTransferMessages(payload);
    const start = messages[0] as { type: "transfer_start"; totalChunks: number };
    expect(start.type).toBe("transfer_start");
    expect(start.totalChunks).toBe(4);
    // 1 start + 4 chunks + 1 complete
    expect(messages).toHaveLength(6);
  });

  it("TransferChunk indices are sequential starting at 0", () => {
    const payload = "a".repeat(CHUNK_SIZE * 2 + 17);
    const messages = createTransferMessages(payload);
    const chunks = messages.filter(
      (m): m is { type: "chunk"; index: number; data: string } =>
        m.type === "chunk",
    );
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("TransferComplete has no data field", () => {
    const messages = createTransferMessages("hello");
    const complete = messages[messages.length - 1];
    expect(complete).toEqual({ type: "transfer_complete" });
    expect(complete).not.toHaveProperty("data");
    expect(complete).not.toHaveProperty("index");
  });

  it("reassembling all TransferChunk.data yields original payload", () => {
    const payload = "x".repeat(CHUNK_SIZE * 3 + 999);
    const messages = createTransferMessages(payload);
    const data = messages
      .filter((m) => m.type === "chunk")
      .map((m) => (m as { data: string }).data);
    expect(reassembleChunks(data)).toBe(payload);
    expect(chunkPayload(payload).join("")).toBe(payload);
  });

  it("messages are correctly typed for downstream consumers", () => {
    const messages = createTransferMessages("hi");
    const start = messages[0];
    const last = messages[messages.length - 1];
    if (start?.type !== "transfer_start") throw new Error("expected start");
    if (last?.type !== "transfer_complete") throw new Error("expected complete");
    // type-narrowing compile check: totalChunks exists on start
    expect(typeof start.totalChunks).toBe("number");
  });
});
