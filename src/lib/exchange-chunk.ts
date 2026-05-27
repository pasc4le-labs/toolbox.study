import { CHUNK_SIZE, type TransferChunk, type TransferStart, type TransferComplete } from "./exchange-protocol";

export function chunkPayload(payload: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    chunks.push(payload.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

export function reassembleChunks(chunks: string[]): string {
  return chunks.join("");
}

export function createTransferMessages(payload: string): Array<TransferStart | TransferChunk | TransferComplete> {
  const chunks = chunkPayload(payload);
  const messages: Array<TransferStart | TransferChunk | TransferComplete> = [
    { type: "transfer_start", totalChunks: chunks.length },
  ];
  for (let i = 0; i < chunks.length; i++) {
    messages.push({ type: "chunk", index: i, data: chunks[i] });
  }
  messages.push({ type: "transfer_complete" });
  return messages;
}
