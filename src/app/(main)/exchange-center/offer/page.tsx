"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { getDb } from "@/db";
import { getAllCards, getAllBundles, getAllExams } from "@/lib/db-queries";
import { useSignaling } from "@/hooks/use-signaling";
import { useWebRTCPeer } from "@/hooks/use-webrtc-peer";
import { buildManifest, serializeSelectedItems } from "@/lib/exchange-serialize";
import { createTransferMessages } from "@/lib/exchange-chunk";
import { ItemPicker, type PickerItem } from "../_components/item-picker";
import type { ExchangeRequest, ImportComplete } from "@/lib/exchange-protocol";

export default function OfferPage() {
  const [cards, setCards] = useState<PickerItem[]>([]);
  const [bundles, setBundles] = useState<PickerItem[]>([]);
  const [exams, setExams] = useState<PickerItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"select" | "waiting" | "connected" | "transferring" | "done">("select");
  const [transferProgress, setTransferProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const [signalingState, signalingActions] = useSignaling();
  const remoteSignalRef = useRef(signalingState.remoteSignal);
  remoteSignalRef.current = signalingState.remoteSignal;

  const [peerState, peerActions] = useWebRTCPeer({
    initiator: true,
    ready: signalingState.status === "paired",
    onSignal: useCallback(
      (data: any) => {
        signalingActions.sendSignal(data);
      },
      [signalingActions],
    ),
  });

  // Load items from DB
  useEffect(() => {
    async function load() {
      const { db } = await getDb();
      const [allCards, allBundles, allExams] = await Promise.all([
        getAllCards(db),
        getAllBundles(db),
        getAllExams(db),
      ]);
      setCards(
        allCards.map((c) => ({ id: c.id, name: c.front.slice(0, 60), meta: c.type })),
      );
      setBundles(
        allBundles.map((b) => ({ id: b.id, name: b.title, meta: b.description ?? "" })),
      );
      setExams(
        allExams.map((e) => ({
          id: e.id,
          name: e.title,
          meta: `${e.questionCount} questions`,
        })),
      );
    }
    load();
  }, []);

  // When peer joins via signaling, signal the remote peer
  useEffect(() => {
    if (signalingState.remoteSignal) {
      peerActions.signalRemote(signalingState.remoteSignal);
    }
  }, [signalingState.remoteSignal, peerActions]);

  // Handle data channel messages from receiver
  useEffect(() => {
    function onData(event: Event) {
      const data = (event as CustomEvent).detail;
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(text);
        if (msg.type === "request") {
          handleRequest(msg as ExchangeRequest);
        }
        if (msg.type === "import_complete") {
          const ic = msg as ImportComplete;
          toast.success(
            `Exchange complete! Peer imported ${ic.imported.cards} cards, ${ic.imported.bundles} bundles, ${ic.imported.exams} exams.`,
          );
          setPhase("done");
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("peer-data", onData);
    return () => window.removeEventListener("peer-data", onData);
  }, [selected]);

  async function handleRequest(request: ExchangeRequest) {
    setPhase("transferring");
    const { db } = await getDb();
    const payload = await serializeSelectedItems(db, request.items);
    const json = JSON.stringify(payload);
    const messages = createTransferMessages(json);

    setTotalChunks(messages.length - 2); // excluding start and complete

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      peerActions.send(JSON.stringify(msg));
      if (msg.type === "chunk") {
        setTransferProgress(msg.index + 1);
      }
      // Small yield to avoid blocking the data channel
      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  const onCreateRoom = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one item to share");
      return;
    }
    setPhase("waiting");
    signalingActions.createRoom();
  };

  // When peer connects via WebRTC
  useEffect(() => {
    if (peerState.connected && phase === "waiting") {
      setPhase("connected");
      // Send manifest
      async function sendManifest() {
        const { db } = await getDb();
        const manifest = await buildManifest(db, {
          cards: cards.filter((c) => selected.has(`card:${c.id}`)).map((c) => c.id),
          bundles: bundles.filter((b) => selected.has(`bundle:${b.id}`)).map((b) => b.id),
          exams: exams.filter((e) => selected.has(`exam:${e.id}`)).map((e) => e.id),
        });
        peerActions.send(JSON.stringify({ type: "manifest", items: manifest }));
      }
      sendManifest();
    }
  }, [peerState.connected, phase, cards, bundles, exams, selected, peerActions]);

  const copyCode = () => {
    if (signalingState.roomCode) {
      navigator.clipboard.writeText(signalingState.roomCode);
      toast.success("Room code copied to clipboard");
    }
  };

  if (phase === "select") {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-xl font-bold">Offer Items</h1>
            <p className="text-sm text-muted-foreground">
              Select the items you want to share with a peer.
            </p>
          </div>
          <ItemPicker
            cards={cards}
            bundles={bundles}
            exams={exams}
            selected={selected}
            onChange={setSelected}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} item(s) selected
            </span>
            <Button onClick={onCreateRoom} disabled={selected.size === 0}>
              Create Room
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Waiting for peer...</h2>
          {signalingState.roomCode && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">Share this room code:</p>
              <button
                onClick={copyCode}
                className="inline-block rounded-lg bg-muted px-6 py-3 font-mono text-3xl font-bold tracking-wider transition-colors hover:bg-muted/80"
              >
                {signalingState.roomCode}
              </button>
            </div>
          )}
          {signalingState.error && (
            <p className="mt-4 text-sm text-destructive">{signalingState.error}</p>
          )}
        </Card>
      </div>
    );
  }

  if (phase === "connected") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Peer connected!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Waiting for peer to select items from your manifest...
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "transferring") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Transferring...</h2>
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${totalChunks > 0 ? (transferProgress / totalChunks) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {transferProgress} / {totalChunks} chunks
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Card className="w-full max-w-md p-8 text-center">
        <h2 className="text-lg font-semibold">Exchange complete!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your peer has successfully imported the items.
        </p>
        <Button className="mt-4" onClick={() => {
          signalingActions.disconnect();
          peerActions.destroy();
          setPhase("select");
          setSelected(new Set());
        }}>
          Share More
        </Button>
      </Card>
    </div>
  );
}
