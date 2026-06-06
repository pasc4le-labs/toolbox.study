"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SignalingState = {
  status: "idle" | "connecting" | "waiting" | "paired" | "error";
  roomCode: string | null;
  error: string | null;
  remoteSignal: unknown | null;
};

export type SignalingActions = {
  createRoom: () => void;
  joinRoom: (code: string) => void;
  sendSignal: (data: unknown) => void;
  disconnect: () => void;
};

const WS_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8080/ws"
    : "";

export function useSignaling(): [SignalingState, SignalingActions] {
  const [state, setState] = useState<SignalingState>({
    status: "idle",
    roomCode: null,
    error: null,
    remoteSignal: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!WS_URL) return;

    setState((s) => ({ ...s, status: "connecting", error: null }));

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, status: "idle", error: null }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "room_created":
            setState((s) => ({
              ...s,
              status: "waiting",
              roomCode: msg.code,
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
              status: "idle",
              error: "Peer disconnected",
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
      setState((s) => ({
        ...s,
        status: s.status === "paired" || s.status === "waiting" ? "error" : "idle",
        error: s.status === "paired" || s.status === "waiting" ? "Connection closed" : null,
      }));
      wsRef.current = null;
    };
  }, []);

  const createRoom = useCallback(() => {
    connect();
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "create_room" }));
        clearInterval(interval);
      }
    }, 50);
    // safety cleanup
    setTimeout(() => clearInterval(interval), 5000);
  }, [connect]);

  const joinRoom = useCallback(
    (code: string) => {
      connect();
      const interval = setInterval(() => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "join_room", code }));
          clearInterval(interval);
        }
      }, 50);
      setTimeout(() => clearInterval(interval), 5000);
    },
    [connect],
  );

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
      roomCode: null,
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

  return [state, { createRoom, joinRoom, sendSignal, disconnect }];
}
