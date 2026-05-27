export type ManifestItem = {
  kind: "card" | "bundle" | "exam";
  id: number;
  displayName: string;
  meta: Record<string, any>;
};

export type ExchangeManifest = {
  type: "manifest";
  items: ManifestItem[];
};

export type ExchangeRequest = {
  type: "request";
  ids: number[];
};

export type TransferStart = {
  type: "transfer_start";
  totalChunks: number;
};

export type TransferChunk = {
  type: "chunk";
  index: number;
  data: string;
};

export type TransferComplete = {
  type: "transfer_complete";
};

export type ImportComplete = {
  type: "import_complete";
  imported: { cards: number; bundles: number; exams: number };
};

export type ExchangeMessage =
  | ExchangeManifest
  | ExchangeRequest
  | TransferStart
  | TransferChunk
  | TransferComplete
  | ImportComplete;

export const CHUNK_SIZE = 16 * 1024; // 16 KB

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
