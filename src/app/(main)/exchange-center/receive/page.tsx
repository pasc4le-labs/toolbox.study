"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDb } from "@/db";
import { useSignaling } from "@/hooks/use-signaling";
import { useWebRTCPeer } from "@/hooks/use-webrtc-peer";
import { importExchangeData } from "@/lib/exchange-import";
import { ManifestViewer } from "../_components/manifest-viewer";
import type { ExchangeManifest, TransferChunk, TransferStart } from "@/lib/exchange-protocol";

export default function ReceivePage() {
  const [roomCode, setRoomCode] = useState("");
  const [phase, setPhase] = useState<"input" | "connecting" | "connected" | "receiving" | "done">("input");
  const [manifest, setManifest] = useState<ExchangeManifest | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [importSummary, setImportSummary] = useState<{ cards: number; bundles: number; exams: number } | null>(null);

  const chunksRef = useRef<string[]>([]);

  const [signalingState, signalingActions] = useSignaling();
  const [peerState, peerActions] = useWebRTCPeer({
    initiator: false,
    onSignal: useCallback(
      (data: any) => {
        signalingActions.sendSignal(data);
      },
      [signalingActions],
    ),
  });

  // When peer joins via signaling, signal the remote peer
  useEffect(() => {
    if (signalingState.remoteSignal) {
      peerActions.signalRemote(signalingState.remoteSignal);
    }
  }, [signalingState.remoteSignal, peerActions]);

  // Handle data channel messages from sender
  useEffect(() => {
    function onData(event: Event) {
      const data = (event as CustomEvent).detail;
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(text);
        if (msg.type === "manifest") {
          setManifest(msg as ExchangeManifest);
        }
        if (msg.type === "transfer_start") {
          const start = msg as TransferStart;
          chunksRef.current = new Array(start.totalChunks).fill("");
          setTotalChunks(start.totalChunks);
          setProgress(0);
          setPhase("receiving");
        }
        if (msg.type === "chunk") {
          const chunk = msg as TransferChunk;
          chunksRef.current[chunk.index] = chunk.data;
          setProgress((p) => p + 1);
        }
        if (msg.type === "transfer_complete") {
          handleTransferComplete();
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("peer-data", onData);
    return () => window.removeEventListener("peer-data", onData);
  }, []);

  async function handleTransferComplete() {
    try {
      const payload = chunksRef.current.join("");
      const data = JSON.parse(payload);
      const { db } = await getDb();
      const result = await importExchangeData(db, data);
      setImportSummary(result);
      setPhase("done");
      peerActions.send(
        JSON.stringify({
          type: "import_complete",
          imported: result,
        }),
      );
      toast.success(
        `Imported ${result.cards} cards, ${result.bundles} bundles, ${result.exams} exams`,
      );
    } catch (err) {
      toast.error("Failed to import items: " + (err as Error).message);
      setPhase("connected");
    }
  }

  const onConnect = () => {
    if (!roomCode.trim()) {
      toast.error("Enter a room code");
      return;
    }
    setPhase("connecting");
    signalingActions.joinRoom(roomCode.trim().toUpperCase());
  };

  // When WebRTC connects
  useEffect(() => {
    if (peerState.connected && phase === "connecting") {
      setPhase("connected");
    }
  }, [peerState.connected, phase]);

  const onRequest = () => {
    if (selected.size === 0) {
      toast.error("Select at least one item to import");
      return;
    }
    const ids = Array.from(selected);
    peerActions.send(JSON.stringify({ type: "request", ids }));
  };

  if (phase === "input") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-xl font-bold">Receive Items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the room code shared by your peer.
          </p>
          <div className="mt-6 space-y-4">
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="e.g. A3XK"
              className="text-center font-mono text-lg uppercase"
              maxLength={4}
            />
            <Button className="w-full" onClick={onConnect}>
              Connect
            </Button>
          </div>
          {signalingState.error && (
            <p className="mt-4 text-sm text-destructive">{signalingState.error}</p>
          )}
        </Card>
      </div>
    );
  }

  if (phase === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Connecting...</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Joining room {roomCode.toUpperCase()}
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "connected" && manifest) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-xl font-bold">Select Items to Import</h1>
            <p className="text-sm text-muted-foreground">
              Your peer is offering {manifest.items.length} item(s).
            </p>
          </div>
          <ManifestViewer
            items={manifest.items}
            selected={selected}
            onChange={setSelected}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} item(s) selected
            </span>
            <Button onClick={onRequest} disabled={selected.size === 0}>
              Request Items
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "receiving") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Receiving items...</h2>
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${totalChunks > 0 ? (progress / totalChunks) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {progress} / {totalChunks} chunks
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Card className="w-full max-w-md p-8 text-center">
        <h2 className="text-lg font-semibold">Import complete!</h2>
        {importSummary && (
          <p className="mt-2 text-sm text-muted-foreground">
            {importSummary.cards} cards, {importSummary.bundles} bundles,{" "}
            {importSummary.exams} exams imported.
          </p>
        )}
        <Button
          className="mt-4"
          onClick={() => {
            signalingActions.disconnect();
            peerActions.destroy();
            setPhase("input");
            setRoomCode("");
            setManifest(null);
            setSelected(new Set());
            setImportSummary(null);
          }}
        >
          Receive More
        </Button>
      </Card>
    </div>
  );
}
