"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDb, persistNow } from "@/db";
import { loadSyncKey, getOrCreateDeviceId, storeLastSyncedAt, loadLastSyncedAt } from "@/lib/sync-storage";
import { validateSyncKey, mnemonicToRoomId } from "@/lib/sync-identity";
import { useSyncSignaling } from "./use-sync-signaling";
import { useWebRTCPeer } from "./use-webrtc-peer";
import { exportFullSnapshot, countSnapshotRecords } from "@/lib/sync-serialize";
import { importFullSnapshot } from "@/lib/sync-import";
import { createTransferMessages } from "@/lib/exchange-chunk";
import type { SyncHello, SyncComplete } from "@/lib/sync-protocol";
import type { TransferStart, TransferChunk } from "@/lib/exchange-protocol";

export type SyncStatus = "idle" | "connecting" | "waiting" | "syncing" | "complete" | "error";

function decodePeerData(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data && typeof data === "object" && "buffer" in data) {
    return new TextDecoder().decode((data as { buffer: ArrayBuffer }).buffer);
  }
  return String(data);
}

export function useSync(): {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  progress: { current: number; total: number } | null;
  startSync: () => void;
  cancelSync: () => void;
} {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => loadLastSyncedAt());

  const chunksRef = useRef<string[]>([]);
  const totalChunksRef = useRef(0);
  const cancelRef = useRef(false);
  const ourHelloSentRef = useRef(false);
  const peerHelloRef = useRef<SyncHello | null>(null);
  const decisionSentRef = useRef(false);
  const sendHelloTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [signalingState, signalingActions] = useSyncSignaling();

  const onSignal = useCallback((data: unknown) => {
    signalingActions.sendSignal(data);
  }, [signalingActions]);

  const [peerState, peerActions] = useWebRTCPeer({
    initiator: true,
    ready: signalingState.status === "paired",
    onSignal,
  });

  const sendSnapshotToPeer = useCallback(async () => {
    if (cancelRef.current) return;
    const deviceId = getOrCreateDeviceId();
    const { db } = await getDb();
    const snapshot = await exportFullSnapshot(db, deviceId);
    const json = JSON.stringify(snapshot);
    const messages = createTransferMessages(json);

    setProgress({ current: 0, total: messages.length - 2 });

    for (let i = 0; i < messages.length; i++) {
      if (cancelRef.current) return;
      const msg = messages[i];
      peerActions.send(JSON.stringify(msg));
      if (msg.type === "chunk") {
        setProgress((p) => p ? { ...p, current: Math.min(p.current + 1, p.total) } : null);
      }
      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }, [peerActions]);

  const sendOurHelloAndDecide = useCallback(async () => {
    if (cancelRef.current) return;
    ourHelloSentRef.current = true;

    const deviceId = getOrCreateDeviceId();
    const { db } = await getDb();
    const snapshot = await exportFullSnapshot(db, deviceId);
    const dbVersion = countSnapshotRecords(snapshot);

    const hello: SyncHello = {
      type: "sync_hello",
      deviceId,
      dbVersion,
      exportedAt: snapshot.exportedAt,
    };
    peerActions.send(JSON.stringify(hello));

    sendHelloTimeoutRef.current = setTimeout(async () => {
      if (decisionSentRef.current) return;
      decisionSentRef.current = true;

      if (cancelRef.current) return;
      const { db: currentDb } = await getDb();
      const ourSnapshot = await exportFullSnapshot(currentDb, deviceId);
      const ourVersion = countSnapshotRecords(ourSnapshot);

      const peer = peerHelloRef.current;
      if (!peer) {
        requestAnimationFrame(() => {
          setStatus("complete");
        });
        const now = Date.now();
        storeLastSyncedAt(now);
        setLastSyncedAt(now);
        return;
      }

      const weSend = peer.dbVersion < ourVersion ||
        (peer.dbVersion === ourVersion && peer.exportedAt < snapshot.exportedAt);

      if (weSend) {
        await sendSnapshotToPeer();
      }
    }, 2000);
  }, [peerActions, sendSnapshotToPeer]);

  const handleTransferComplete = useCallback(async () => {
    if (cancelRef.current) return;
    requestAnimationFrame(() => setStatus("syncing"));
    try {
      const json = chunksRef.current.join("");
      const snapshot = JSON.parse(json);
      const { db } = await getDb();
      const result = await importFullSnapshot(db, snapshot);
      await persistNow();

      const complete: SyncComplete = {
        type: "sync_complete",
        imported: {
          cards: result.cardsImported + result.cardsUpdated,
          bundles: result.bundlesImported,
          exams: result.examsImported,
          tags: result.tagsImported,
          reviewLogs: result.reviewLogsImported,
          examAttempts: result.examAttemptsImported,
          cardFsrsUpdated: result.cardFsrsUpdated,
        },
      };
      peerActions.send(JSON.stringify(complete));

      requestAnimationFrame(() => {
        setStatus("complete");
        setProgress(null);
      });
      const now = Date.now();
      storeLastSyncedAt(now);
      setLastSyncedAt(now);
    } catch (err) {
      requestAnimationFrame(() => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Import failed");
      });
    }
  }, [peerActions]);

  useEffect(() => {
    if (signalingState.remoteSignal) {
      peerActions.signalRemote(signalingState.remoteSignal);
    }
  }, [signalingState.remoteSignal, peerActions]);

  useEffect(() => {
    if (peerState.connected) {
      requestAnimationFrame(() => setStatus("syncing"));
      sendOurHelloAndDecide();
    }
  }, [peerState.connected, sendOurHelloAndDecide]);

  useEffect(() => {
    const err = peerState.error;
    if (err) {
      requestAnimationFrame(() => {
        setStatus("error");
        setError(err.message);
      });
    }
  }, [peerState.error]);

  useEffect(() => {
    if (signalingState.status === "error") {
      requestAnimationFrame(() => {
        setStatus("error");
        setError(signalingState.error);
      });
    }
  }, [signalingState.status, signalingState.error]);

  // Listen for peer-data events
  useEffect(() => {
    function onData(event: Event) {
      const raw = (event as CustomEvent).detail;
      const text = decodePeerData(raw);
      try {
        const msg = JSON.parse(text);
        switch (msg.type) {
          case "sync_hello": {
            peerHelloRef.current = msg as SyncHello;
            break;
          }
          case "sync_snapshot_offer":
          case "transfer_start": {
            const start = msg as TransferStart;
            totalChunksRef.current = start.totalChunks;
            chunksRef.current = [];
            setProgress({ current: 0, total: start.totalChunks });
            break;
          }
          case "chunk": {
            const chunk = msg as TransferChunk;
            chunksRef.current[chunk.index] = chunk.data;
            setProgress((p) => p ? { ...p, current: p.current + 1 } : null);
            break;
          }
          case "transfer_complete": {
            handleTransferComplete();
            break;
          }
          case "sync_complete": {
            requestAnimationFrame(() => {
              setStatus("complete");
              setProgress(null);
            });
            const now = Date.now();
            storeLastSyncedAt(now);
            setLastSyncedAt(now);
            break;
          }
          case "sync_abort": {
            requestAnimationFrame(() => {
              setStatus("error");
              setError(msg.reason || "Sync aborted by peer");
            });
            break;
          }
        }
      } catch {
        // ignore malformed messages
      }
    }
    window.addEventListener("peer-data", onData);
    return () => window.removeEventListener("peer-data", onData);
  }, [handleTransferComplete]);

  const startSync = useCallback(async () => {
    const key = loadSyncKey();
    if (!key) {
      setStatus("idle");
      return;
    }
    if (!validateSyncKey(key)) {
      requestAnimationFrame(() => {
        setError("Invalid sync key");
        setStatus("error");
      });
      return;
    }

    cancelRef.current = false;
    ourHelloSentRef.current = false;
    peerHelloRef.current = null;
    decisionSentRef.current = false;
    chunksRef.current = [];
    totalChunksRef.current = 0;
    requestAnimationFrame(() => {
      setError(null);
      setProgress(null);
      setStatus("connecting");
    });

    const roomId = await mnemonicToRoomId(key);
    signalingActions.connect(roomId);
  }, [signalingActions]);

  const cancelSync = useCallback(() => {
    cancelRef.current = true;
    if (sendHelloTimeoutRef.current) {
      clearTimeout(sendHelloTimeoutRef.current);
    }
    peerActions.destroy();
    signalingActions.disconnect();
    requestAnimationFrame(() => {
      setStatus("idle");
      setProgress(null);
      setError(null);
    });
  }, [peerActions, signalingActions]);

  useEffect(() => {
    const key = loadSyncKey();
    if (key && validateSyncKey(key)) {
      startSync();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (sendHelloTimeoutRef.current) {
        clearTimeout(sendHelloTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSyncedAt,
    error,
    progress,
    startSync,
    cancelSync,
  };
}
