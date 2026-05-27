# Architecture

## Overview

StudyToolbox is a local-first study application. All user data lives in an in-memory SQLite database (via sql.js) that is persisted to the browser's IndexedDB.

## Applets

- **Study Dome** — Flashcard review with FSRS spaced repetition, bundles, tags, and exams.
- **AI Factory** — Generate flashcards from any content using OpenAI-compatible AI providers.
- **Exchange Center** — P2P sharing of cards, bundles, and exams via WebRTC.

## P2P Exchange Flow

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│   Sender    │◄─WebSocket─►│ Relay Server │◄─WebSocket─►│  Receiver   │
│  (Browser)  │  signaling  │   (Go/WS)    │  signaling  │  (Browser)  │
└──────┬──────┘          └──────────────┘          └──────┬──────┘
       │                                                   │
       └─────────────── WebRTC DataChannel ────────────────┘
                        (direct P2P transfer)
```

1. Sender creates a room on the relay → gets a 4-char code.
2. Receiver joins the room using the code.
3. Relay pairs them and forwards SDP/ICE signals.
4. WebRTC DataChannel opens directly between browsers.
5. Sender sends a **manifest** (metadata only).
6. Receiver selects items and sends a **request**.
7. Sender serializes the full data, chunks it, and sends via DataChannel.
8. Receiver imports items into their local sql.js DB, remapping IDs and merging tags.

## Database

- sql.js (SQLite compiled to WASM)
- Drizzle ORM for type-safe queries
- IndexedDB for persistence between sessions
- Migrations handled via Drizzle Kit

## Relay

A standalone Go binary in `relay/`:
- WebSocket signaling using `github.com/coder/websocket`
- Room management with 10-minute TTL
- Expired room sweeper
- Graceful shutdown on SIGINT/SIGTERM
- Dockerized with distroless base image
