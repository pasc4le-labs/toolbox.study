import type { TransferStart, TransferChunk, TransferComplete } from './exchange-protocol';

export type SyncHello = {
  type: "sync_hello";
  deviceId: string;
  dbVersion: number;
  exportedAt: number;
};

export type SyncSnapshotOffer = {
  type: "sync_snapshot_offer";
  totalChunks: number;
};

export type SyncComplete = {
  type: "sync_complete";
  imported: {
    cards: number;
    bundles: number;
    exams: number;
    tags: number;
    reviewLogs: number;
    examAttempts: number;
    cardFsrsUpdated: number;
  };
};

export type SyncAbort = {
  type: "sync_abort";
  reason: string;
};

export type SyncMessage =
  | SyncHello
  | SyncSnapshotOffer
  | TransferStart
  | TransferChunk
  | TransferComplete
  | SyncComplete
  | SyncAbort;
