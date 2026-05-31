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

## Exam → FSRS Pipeline

When a student completes an exam (`completeExamAttempt` in `src/lib/db-queries.ts`), each auto-graded answer feeds into the FSRS spaced-repetition scheduler:

| `examAnswers.isCorrect` | FSRS Rating | Effect |
|---|---|---|
| `true` | `Rating.Good` (3) | Card reinforced — scheduled further into the future |
| `false` | `Rating.Again` (1) | Card marked for re-review — becomes due sooner |
| `null` (open answers) | Skipped | No automatic FSRS update (cannot auto-grade) |

This update happens automatically on exam completion, using the existing `rateCard` function. Each card's `cardFsrs` row is updated and a `reviewLogs` entry is inserted. The call is wrapped in a try/catch so that a single card failure doesn't prevent exam completion.

The results page displays a summary of how many cards were reinforced vs. marked for re-review, and offers a "Review Weak Cards" button linking to the review page filtered by the exam's bundle.

### Mapping Code (`src/lib/db-queries.ts`)

```ts
// Inside completeExamAttempt, after score computation:
for (const answer of answered) {
  try {
    const rating = answer.isCorrect ? Rating.Good : Rating.Again;
    await rateCard(db, answer.cardId, rating);
  } catch (e) {
    console.error(`Failed to update FSRS for card ${answer.cardId}:`, e);
  }
}
await persistNow();
```

## Bundle Exam Statistics

The bundle statistics page at `/study-dome/bundles/[id]/stats` provides students with visual performance tracking.

**Data sources:**
- `getBundleExamStats` — returns all exam attempts for a bundle with computed aggregates (avg/best/worst score, total time)
- `getBundleCardWeakness` — returns per-card correct/incorrect counts from graded exam answers, sorted by highest incorrect rate

**Visualizations** (powered by [Unovis](https://unovis.dev/) `@unovis/react`):
- **Line chart** — score trend over attempts (shows progress over time)
- **Donut chart** — overall correct vs. incorrect answer distribution
- **Stacked bar chart** — weak cards analysis, sorted by highest incorrect rate

**Summary cards** — total attempts, average score (with progress bar), best/worst score, total time spent.

## Relay

A standalone Go binary in `relay/`:
- WebSocket signaling using `github.com/coder/websocket`
- Room management with 10-minute TTL
- Expired room sweeper
- Graceful shutdown on SIGINT/SIGTERM
- Dockerized with distroless base image
