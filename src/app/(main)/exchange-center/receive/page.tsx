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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [importSummary, setImportSummary] = useState<{ cards: number; bundles: number; exams: number } | null>(null);

  const chunksRef = useRef<string[]>([]);

  const [signalingState, signalingActions] = useSignaling();
  const [peerState, peerActions] = useWebRTCPeer({
    initiator: false,
    ready: signalingState.status === "paired",
    onSignal: useCallback(
      (data: unknown) => {
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

  const handleTransferComplete = useCallback(async () => {
    try {
      const payload = chunksRef.current.join("");
      console.log("[exchange/rx] Reassembled payload length:", payload.length);
      const data = JSON.parse(payload);
      console.log("[exchange/rx] Parsed payload:", {
        cards: data.cards?.length ?? 0,
        bundles: data.bundles?.length ?? 0,
        exams: data.exams?.length ?? 0,
        cardIds: data.cards?.map((c: unknown) => (c as Record<string, unknown>).id),
        bundleDetails: data.bundles?.map((b: unknown) => ({ id: (b as Record<string, unknown>).id, title: (b as Record<string, unknown>).title, cardIds: (b as Record<string, unknown>).cardIds })),
        firstCard: data.cards?.[0],
        firstBundle: data.bundles?.[0],
      });
      const { db } = await getDb();
      console.log("[exchange/rx] Calling importExchangeData...");
      const result = await importExchangeData(db, data);
      console.log("[exchange/rx] importExchangeData result:", result);
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
      console.error("[exchange/rx] Import failed:", err);
      toast.error("Failed to import items: " + (err as Error).message);
      setPhase("connected");
    }
  }, [peerActions]);

  // Handle data channel messages from sender
  useEffect(() => {
    function onData(event: Event) {
      const data = (event as CustomEvent).detail;
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(text);
        console.log("[exchange/rx] Received message type:", msg.type);
        if (msg.type === "manifest") {
          const manifestMsg = msg as ExchangeManifest;
          console.log("[exchange/rx] Manifest received:", manifestMsg.items.length, "items", manifestMsg.items.map(m => `${m.kind}:${m.id} ${m.displayName}`));
          setManifest(manifestMsg);
        }
        if (msg.type === "transfer_start") {
          const start = msg as TransferStart;
          console.log("[exchange/rx] Transfer starting:", start.totalChunks, "chunks expected");
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
          console.log("[exchange/rx] Transfer complete, total chunks received:", chunksRef.current.filter(c => c !== "").length, "/", chunksRef.current.length);
          handleTransferComplete();
        }
      } catch (e) {
        console.warn("[exchange/rx] Failed to parse peer-data:", e);
      }
    }
    window.addEventListener("peer-data", onData);
    return () => window.removeEventListener("peer-data", onData);
  }, [handleTransferComplete]);

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
      const raf = requestAnimationFrame(() => setPhase("connected"));
      return () => cancelAnimationFrame(raf);
    }
  }, [peerState.connected, phase]);

  // React to signaling errors — never stuck on "connecting"
  useEffect(() => {
    if (signalingState.status === "error" && phase === "connecting") {
      const raf = requestAnimationFrame(() => {
        setPhase("input");
        toast.error(signalingState.error ?? "Connection failed");
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [signalingState.status, signalingState.error, phase]);

  // React to WebRTC errors during connecting
  useEffect(() => {
    if (peerState.error && phase === "connecting") {
      const raf = requestAnimationFrame(() => {
        setPhase("input");
        toast.error("WebRTC error: " + peerState.error?.message);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [peerState.error, phase]);

  const onRequest = () => {
    if (selected.size === 0) {
      toast.error("Select at least one item to import");
      return;
    }
    const items = Array.from(selected).map((key) => {
      const [kind, idStr] = key.split(":");
      return { kind: kind as "card" | "bundle" | "exam", id: parseInt(idStr, 10) };
    });
    console.log("[exchange/rx] Sending request with items:", items);
    peerActions.send(JSON.stringify({ type: "request", items }));
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
          {signalingState.error && (
            <p className="mt-4 text-sm text-destructive">{signalingState.error}</p>
          )}
          {peerState.error && (
            <p className="mt-4 text-sm text-destructive">{peerState.error.message}</p>
          )}
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
