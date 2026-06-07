"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SyncSignalingState = {
  status: "idle" | "connecting" | "waiting" | "paired" | "error";
  roomId: string | null;
  error: string | null;
  remoteSignal: unknown | null;
};

export type SyncSignalingActions = {
  connect: (roomId: string) => void;
  sendSignal: (data: unknown) => void;
  disconnect: () => void;
};

const WS_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8080/ws"
    : "";

export function useSyncSignaling(): [SyncSignalingState, SyncSignalingActions] {
  const [state, setState] = useState<SyncSignalingState>({
    status: "idle",
    roomId: null,
    error: null,
    remoteSignal: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const connect = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (!WS_URL) return;

    setState({ status: "connecting", roomId: null, error: null, remoteSignal: null });

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "create_room", code: roomId, room_type: "sync" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "room_created":
            setState((s) => ({
              ...s,
              status: "waiting",
              roomId: roomId,
            }));
            break;
          case "peer_joined":
            setState((s) => ({
              ...s,
              status: "paired",
              error: null,
            }));
            break;
          case "signal":
            setState((s) => ({
              ...s,
              remoteSignal: msg.data,
            }));
            break;
          case "peer_left":
            setState((s) => ({
              ...s,
              status: "waiting",
              error: null,
            }));
            break;
          case "error":
            setState((s) => ({
              ...s,
              status: "error",
              error: msg.message || "Unknown error",
            }));
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setState((s) => ({
        ...s,
        status: "error",
        error: "WebSocket error",
      }));
    };

    ws.onclose = () => {
      setState((s) => {
        if (s.status === "paired" || s.status === "waiting" || s.status === "connecting") {
          return { ...s, status: "idle", error: "Connection closed" };
        }
        return s;
      });
      wsRef.current = null;
    };
  }, []);

  const sendSignal = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "signal", data }));
    }
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.close();
      wsRef.current = null;
    }
    setState({
      status: "idle",
      roomId: null,
      error: null,
      remoteSignal: null,
    });
  }, []);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, []);

  return [state, { connect, sendSignal, disconnect }];
}
