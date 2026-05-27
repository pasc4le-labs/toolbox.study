"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type SimplePeerInstance } from "simple-peer-light";

export type PeerState = {
  connected: boolean;
  error: Error | null;
};

export type PeerActions = {
  send: (data: string | Uint8Array) => void;
  destroy: () => void;
  signalRemote: (data: any) => void;
};

export function useWebRTCPeer(opts: {
  initiator: boolean;
  onSignal: (data: any) => void;
}): [PeerState, PeerActions] {
  const [state, setState] = useState<PeerState>({
    connected: false,
    error: null,
  });

  const peerRef = useRef<SimplePeerInstance | null>(null);
  const onSignalRef = useRef(opts.onSignal);
  onSignalRef.current = opts.onSignal;

  useEffect(() => {
    const peer = new Peer({
      initiator: opts.initiator,
      trickle: false,
      config: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      },
    });

    peerRef.current = peer;

    peer.on("signal", (data) => {
      onSignalRef.current(data);
    });

    peer.on("connect", () => {
      setState({ connected: true, error: null });
    });

    peer.on("data", (data) => {
      // Data received — hook consumers should subscribe via onData callback
      // We emit a custom event for the page component to listen
      window.dispatchEvent(
        new CustomEvent("peer-data", { detail: data }),
      );
    });

    peer.on("error", (err) => {
      setState({ connected: false, error: err });
    });

    peer.on("close", () => {
      setState({ connected: false, error: null });
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
    };
  }, [opts.initiator]);

  const send = useCallback((data: string | Uint8Array) => {
    const peer = peerRef.current;
    if (!peer || !peer.connected) {
      console.warn("peer not connected, cannot send");
      return;
    }
    peer.send(data);
  }, []);

  const destroy = useCallback(() => {
    peerRef.current?.destroy();
    peerRef.current = null;
    setState({ connected: false, error: null });
  }, []);

  const signalRemote = useCallback((data: any) => {
    const peer = peerRef.current;
    if (!peer) {
      console.warn("peer not initialized, cannot signal");
      return;
    }
    peer.signal(data);
  }, []);

  return [state, { send, destroy, signalRemote }];
}
