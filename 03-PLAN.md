# 03 — Device Sync Plan

> Add automatic P2P data sync across devices using BIP39 mnemonic keys for room pairing, full DB snapshot merge on startup, and a persistent sync room on the relay server.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **DB schema** | 11 tables: cards, tags, card_tags, bundles, bundle_cards, card_fsrs, review_logs, exams, exam_attempts, exam_answers, exam_questions, ai_providers, todos. Cards/bundles have `createdAt`/`updatedAt`; exam_attempts have `startedAt`/`completedAt`. |
| **Exchange center** | Manual P2P via WebRTC (`simple-peer-light`) + Go relay. Offer page creates 4-char room, receive page joins. Relay at `relay/`. Uses `useSignaling` hook (WebSocket to relay) + `useWebRTCPeer` hook (data channel). |
| **Relay server** | Go, `coder/websocket`, 4-char room codes, max 2 clients, 10-min TTL, rooms deleted on disconnect. Files: `hub.go`, `room.go`, `client.go`, `handler.go`, `message.go`, `config.go`. |
| **Auto-persist** | `src/db/index.ts` monkey-patches `sqlDb.prepare()` — INSERT/UPDATE/DELETE/CREATE/DROP/ALTER trigger debounced `persistNow()` saving DB snapshot to IndexedDB. |
| **Import logic** | `src/lib/exchange-import.ts` — `importExchangeData()` merges cards (dedup by front+type, skip if exists), bundles (always create new), tags (getOrCreateTag), exams (always create new). Does NOT sync FSRS state, review logs, exam attempts, or answers. |
| **Serialization** | `src/lib/exchange-serialize.ts` — `serializeSelectedItems()` exports cards/bundles/exams with their tags and card IDs. `src/lib/exchange-chunk.ts` — chunks payload into 16KB messages using `TransferStart`/`TransferChunk`/`TransferComplete` protocol. |
| **BIP39** | `@scure/bip39` npm package — lightweight, audited, works in browser and Node. `generateMnemonic(wordlist, 128)` → 12 words. `validateMnemonic(mnemonic, wordlist)` → boolean. `mnemonicToEntropy(mnemonic, wordlist)` → Uint8Array. Imports: `import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '@scure/bip39'` and `import { wordlist } from '@scure/bip39/wordlists/english'`. |
| **Room ID derivation** | Use Web Crypto API `crypto.subtle.digest('SHA-256', new TextEncoder().encode(mnemonic))` → take first 8 bytes as hex string (16-char room ID). Available in browser and Node 18+. |
| **Simple-peer-light** | Already installed (`simple-peer-light@9.10.0`). `new Peer({ initiator, trickle: false, config: { iceServers: [...] } })`. `peer.on('data', data => ...)` dispatches `CustomEvent('peer-data')`. Existing `useWebRTCPeer` hook in `src/hooks/use-webrtc-peer.ts`. |
| **Signaling** | `useSignaling` hook in `src/hooks/use-signaling.ts` — WebSocket to `NEXT_PUBLIC_RELAY_URL`, supports `createRoom`, `joinRoom`, `sendSignal`, `disconnect`. |
| **Test helpers** | `src/__tests__/helpers/test-db.ts` — `createTestDb()` makes in-memory SQLite with migrations, `destroyTestDb()` closes it. Used in service tests. |
| **Test framework** | Vitest, `globals: true`, `environment: "node"`, tests in `src/**/*.test.ts`. |
| **Sync scope** | ALL tables except `ai_providers` (contains API keys — per-device settings). Cards, tags, card_tags, bundles, bundle_cards, card_fsrs, review_logs, exams, exam_attempts, exam_answers, exam_questions, todos all sync. |
| **Merge strategy** | Cards: dedup by front+type, update if remote `updatedAt` is newer. Tags: dedup by name. Bundles: always create new (titles may repeat). card_tags/bundle_cards: dedup by ID pairs after mapping. card_fsrs: update if remote has more `reps` or later `lastReview`. review_logs/exam_attempts/exam_answers/exam_questions/todos: append-only import. |

---

## Phase 0 — Dependencies & Schema

### Task 0.1: Install `@scure/bip39`

**What**: Add the BIP39 mnemonic library for generating and validating 12-word sync keys.

**Files**: `package.json` (modified)

**Implementation notes**:
1. Run `pnpm add @scure/bip39`
2. Verify installation with `pnpm typecheck`

**Tests**: `pnpm typecheck` passes.

**Commit**: `chore: add @scure/bip39 dependency`

### Task 0.2: Add `lastSyncedAt` and `syncDeviceId` to localStorage helpers

**What**: Create utility functions for storing and retrieving sync state in localStorage (not in the DB, since this is device-specific metadata).

**Files**: `src/lib/sync-storage.ts` (new)

**Implementation notes**:
1. Create `src/lib/sync-storage.ts` with:
   ```ts
   const SYNC_KEY = 'sync-mnemonic';
   const LAST_SYNC_KEY = 'sync-last-synced';
   const DEVICE_ID_KEY = 'sync-device-id';

   export function storeSyncKey(mnemonic: string): void {
     localStorage.setItem(SYNC_KEY, mnemonic);
   }

   export function loadSyncKey(): string | null {
     return localStorage.getItem(SYNC_KEY);
   }

   export function deleteSyncKey(): void {
     localStorage.removeItem(SYNC_KEY);
     localStorage.removeItem(LAST_SYNC_KEY);
   }

   export function storeLastSyncedAt(timestamp: number): void {
     localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
   }

   export function loadLastSyncedAt(): number | null {
     const val = localStorage.getItem(LAST_SYNC_KEY);
     return val ? parseInt(val, 10) : null;
   }

   export function getOrCreateDeviceId(): string {
     let id = localStorage.getItem(DEVICE_ID_KEY);
     if (!id) {
       id = crypto.randomUUID();
       localStorage.setItem(DEVICE_ID_KEY, id);
     }
     return id;
   }
   ```
2. These are pure localStorage helpers — no DB interaction.

**Tests**:
- Test case A: `storeSyncKey` / `loadSyncKey` — store a mnemonic, load it, assert equality. (Use `vi.spyOn(Storage.prototype, 'setItem')` and `vi.spyOn(Storage.prototype, 'getItem')`.)
- Test case B: `deleteSyncKey` — store then delete, assert `loadSyncKey()` returns `null`.
- Test case C: `getOrCreateDeviceId` — first call generates UUID, second call returns same UUID.
- Test case D: `storeLastSyncedAt` / `loadLastSyncedAt` — store timestamp, load it, assert equality.

**Commit**: `feat(sync): add localStorage sync state helpers`

---

## Phase 1 — Sync Identity

### Task 1.1: Create sync-identity module

**What**: Module for generating BIP39 mnemonics, validating them, and deriving room IDs.

**Files**: `src/lib/sync-identity.ts` (new)

**API reference** (verified from `@scure/bip39` docs):
```ts
import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// Generate 128-bit (12-word) mnemonic
const mnemonic = generateMnemonic(wordlist, 128);

// Validate mnemonic
validateMnemonic(mnemonic, wordlist); // true

// Convert mnemonic to entropy bytes
const entropy = mnemonicToEntropy(mnemonic, wordlist); // Uint8Array
```

**Implementation notes**:
1. Create `src/lib/sync-identity.ts` with:
   ```ts
   import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
   import { wordlist } from '@scure/bip39/wordlists/english';

   export { wordlist };

   export function generateSyncKey(): string {
     return generateMnemonic(wordlist, 128);
   }

   export function validateSyncKey(mnemonic: string): boolean {
     const trimmed = mnemonic.trim().toLowerCase();
     if (trimmed.split(/\s+/).length !== 12) return false;
     return validateMnemonic(trimmed, wordlist);
   }

   export async function mnemonicToRoomId(mnemonic: string): Promise<string> {
     const trimmed = mnemonic.trim().toLowerCase();
     const entropy = mnemonicToEntropy(trimmed, wordlist);
     const hash = await crypto.subtle.digest('SHA-256', entropy);
     const hashArray = new Uint8Array(hash);
     return Array.from(hashArray.slice(0, 8))
       .map(b => b.toString(16).padStart(2, '0'))
       .join('');
   }

   export function normalizeMnemonic(mnemonic: string): string {
     return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
   }
   ```
2. `mnemonicToRoomId` uses Web Crypto `crypto.subtle.digest('SHA-256', ...)` — available in browser and Node 18+. Returns the first 16 hex characters (8 bytes) of the SHA-256 hash of the BIP39 entropy.
3. `normalizeMnemonic` trims and lowercases, collapses multiple spaces.
4. `validateSyncKey` checks for exactly 12 words and passes BIP39 validation.

**Tests**:
- Test case A: `generateSyncKey()` returns a string with exactly 12 space-separated words.
- Test case B: `validateSyncKey()` returns `true` for a valid generated mnemonic.
- Test case C: `validateSyncKey()` returns `false` for invalid input ("hello world foo bar").
- Test case D: `validateSyncKey()` returns `false` for 11 words or 13 words.
- Test case E: `mnemonicToRoomId()` returns a 16-character hex string.
- Test case F: `mnemonicToRoomId()` is deterministic — same mnemonic produces same room ID.
- Test case G: `normalizeMnemonic()` trims, lowercases, collapses whitespace.

**Commit**: `feat(sync): add BIP39 mnemonic generation and room ID derivation`

---

## Phase 2 — Sync Protocol & Serialization

### Task 2.1: Define sync protocol message types

**What**: Define the typed messages exchanged during the sync handshake and data transfer.

**Files**: `src/lib/sync-protocol.ts` (new)

**Implementation notes**:
1. Create `src/lib/sync-protocol.ts` with the following types:
   ```ts
   export type SyncHello = {
     type: 'sync_hello';
     deviceId: string;
     dbVersion: number; // number of records as a rough version indicator
     exportedAt: number; // Date.now() when snapshot was taken
   };

   export type SyncSnapshotOffer = {
     type: 'sync_snapshot_offer';
     totalChunks: number;
   };

   // Reuses TransferStart, TransferChunk, TransferComplete from exchange-protocol
   // But wraps them in a sync context

   export type SyncComplete = {
     type: 'sync_complete';
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
     type: 'sync_abort';
     reason: string;
   };

   export type SyncMessage =
     | SyncHello
     | SyncSnapshotOffer
     | import('./exchange-protocol').TransferStart
     | import('./exchange-protocol').TransferChunk
     | import('./exchange-protocol').TransferComplete
     | SyncComplete
     | SyncAbort;
   ```
2. The sync flow is:
   - Both peers send `SyncHello` with their `deviceId`, `dbVersion`, and `exportedAt`
   - The peer with the earlier `exportedAt` (or lower `dbVersion`) requests the snapshot
   - If both have the same `dbVersion` and `exportedAt`, skip sync
   - The newer peer sends `SyncSnapshotOffer` with chunk count
   - Then sends `TransferStart`, `TransferChunk[]`, `TransferComplete` (reusing exchange protocol)
   - The receiving peer imports and sends `SyncComplete`

**Tests**:
- Test case A: Type-checking only — verify the module compiles without errors via `pnpm typecheck`.

**Commit**: `feat(sync): define sync protocol message types`

### Task 2.2: Create full DB serializer

**What**: Serialize ALL DB tables (except `ai_providers`) into a JSON snapshot for sync transfer.

**Files**: `src/lib/sync-serialize.ts` (new)

**Implementation notes**:
1. Create `src/lib/sync-serialize.ts` that exports:
   ```ts
   import type { Db } from '@/lib/services/types';
   import * as schema from '@/db/schema';

   export type FullSnapshot = {
     version: 1;
     exportedAt: number;
     deviceId: string;
     cards: typeof schema.cards.$inferSelect[];
     tags: typeof schema.tags.$inferSelect[];
     cardTags: typeof schema.cardTags.$inferSelect[];
     bundles: typeof schema.bundles.$inferSelect[];
     bundleCards: typeof schema.bundleCards.$inferSelect[];
     cardFsrs: typeof schema.cardFsrs.$inferSelect[];
     reviewLogs: typeof schema.reviewLogs.$inferSelect[];
     exams: typeof schema.exams.$inferSelect[];
     examAttempts: typeof schema.examAttempts.$inferSelect[];
     examAnswers: typeof schema.examAnswers.$inferSelect[];
     examQuestions: typeof schema.examQuestions.$inferSelect[];
     todos: typeof schema.todos.$inferSelect[];
   };

   export async function exportFullSnapshot(db: Db, deviceId: string): Promise<FullSnapshot> {
     const [
       cards, tags, cardTags, bundles, bundleCards,
       cardFsrs, reviewLogs, exams, examAttempts,
       examAnswers, examQuestions, todos,
     ] = await Promise.all([
       db.select().from(schema.cards).orderBy(schema.cards.id),
       db.select().from(schema.tags).orderBy(schema.tags.id),
       db.select().from(schema.cardTags),
       db.select().from(schema.bundles).orderBy(schema.bundles.id),
       db.select().from(schema.bundleCards),
       db.select().from(schema.cardFsrs).orderBy(schema.cardFsrs.cardId),
       db.select().from(schema.reviewLogs).orderBy(schema.reviewLogs.id),
       db.select().from(schema.exams).orderBy(schema.exams.id),
       db.select().from(schema.examAttempts).orderBy(schema.examAttempts.id),
       db.select().from(schema.examAnswers).orderBy(schema.examAnswers.id),
       db.select().from(schema.examQuestions).orderBy(schema.examQuestions.id),
       db.select().from(schema.todos).orderBy(schema.todos.id),
     ]);

     return {
       version: 1,
       exportedAt: Date.now(),
       deviceId,
       cards,
       tags,
       cardTags,
       bundles,
       bundleCards,
       cardFsrs,
       reviewLogs,
       exams,
       examAttempts,
       examAnswers,
       examQuestions,
       todos,
     };
   }

   export function countSnapshotRecords(snapshot: FullSnapshot): number {
     return snapshot.cards.length
       + snapshot.tags.length
       + snapshot.bundles.length
       + snapshot.exams.length
       + snapshot.reviewLogs.length
       + snapshot.examAttempts.length;
   }
   ```
2. `aiProviders` table is intentionally excluded — it contains API keys that are per-device settings.
3. All rows are sorted by ID for deterministic serialization.

**Tests**:
- Test case A: `exportFullSnapshot` on an empty DB returns a snapshot with all arrays empty, `version: 1`, and a valid `deviceId`.
- Test case B: `exportFullSnapshot` on a DB with cards and tags includes them in the snapshot.
- Test case C: `countSnapshotRecords` counts cards + tags + bundles + exams + reviewLogs + examAttempts.
- Use `createTestDb` from `@/__tests__/helpers/test-db` and insert data via service functions.

**Commit**: `feat(sync): add full DB snapshot serialization`

### Task 2.3: Create full DB import/merge module

**What**: Import a full DB snapshot from a peer, merging intelligently with existing data.

**Files**: `src/lib/sync-import.ts` (new)

**Implementation notes**:
1. This is the most complex module. It must handle:
   - **Cards**: Dedup by `front + type`. If a matching card exists, update its `back`, `explanation`, `options`, `correctIndices`, `updatedAt` if the remote `updatedAt` is newer.
   - **Tags**: Dedup by name. Use `getOrCreateTag` for import. Never delete existing tags.
   - **card_tags**: After resolving card and tag IDs, insert only new (cardId, tagId) pairs.
   - **Bundles**: Always create new bundles on import (even if title matches — users may have bundles with the same name on different devices). Track old ID → new ID mapping.
   - **bundle_cards**: After resolving card and bundle IDs, insert only new (cardId, bundleId) pairs.
   - **card_fsrs**: For each card that exists locally, update FSRS state if remote has more `reps` or later `lastReview`. Never create FSRS for non-existent cards.
   - **review_logs**: Append-only. Insert all review logs for mapped card IDs that don't already exist (check by `cardId + review` timestamp uniqueness).
   - **Exams**: Import new exams, mapping `bundleId` references.
   - **exam_attempts**: Append-only. Import all attempts that don't already exist.
   - **exam_answers**: Import answers for mapped attempt IDs.
   - **exam_questions**: Import questions for mapped attempt IDs.
   - **todos**: Append-only. Import all todos that don't already exist (check by `title + createdAt` uniqueness).

2. Create `src/lib/sync-import.ts`:
   ```ts
   import { eq, and } from 'drizzle-orm';
   import * as schema from '@/db/schema';
   import { getOrCreateTag } from '@/lib/services';
   import { persistNow } from '@/db';
   import type { Db } from '@/lib/services/types';
   import type { FullSnapshot } from './sync-serialize';

   export type SyncImportResult = {
     cardsImported: number;
     cardsUpdated: number;
     tagsImported: number;
     bundlesImported: number;
     cardFsrsUpdated: number;
     reviewLogsImported: number;
     examsImported: number;
     examAttemptsImported: number;
     examAnswersImported: number;
     examQuestionsImported: number;
     todosImported: number;
   };

   export async function importFullSnapshot(
     db: Db,
     snapshot: FullSnapshot,
   ): Promise<SyncImportResult> {
     // ... detailed merge logic
   }
   ```
3. The function must handle the snapshot `version` field — if it's not `1`, throw an error.
4. At the end, call `persistNow()` to save the merged DB to IndexedDB.

**Tests**:
- Test case A: Import an empty snapshot into an empty DB — all counts are 0.
- Test case B: Import a snapshot with 2 cards, 3 tags, 1 bundle into an empty DB — verify cards, tags, bundle exist with correct data.
- Test case C: Import a snapshot where a card with the same `front + type` already exists — verify the card is updated (not duplicated) if remote `updatedAt` is newer; skip if local `updatedAt` is equal or newer.
- Test case D: Import a snapshot with tags — existing tags are reused via `getOrCreateTag`, new tags are created.
- Test case E: Import a snapshot with bundles — bundles always get new IDs; `bundleCards` are mapped correctly.
- Test case F: Import a snapshot with `cardFsrs` — FSRS state is updated for existing cards.
- Test case G: Import a snapshot with `reviewLogs` — logs are appended (not duplicated).
- Test case H: Import a snapshot where `version !== 1` — throws an error.

**Commit**: `feat(sync): add full DB snapshot import/merge`

---

## Phase 3 — Relay Server Changes

### Task 3.1: Add sync room support to relay

**What**: Extend the Go relay server to support persistent sync rooms with longer codes, longer TTL, and the ability to not delete rooms on disconnect.

**Files**:
- `relay/room.go` (modify)
- `relay/hub.go` (modify)
- `relay/message.go` (modify)
- `relay/config.go` (modify)

**Implementation notes**:
1. **`relay/room.go`**: Add a `RoomType` field and a `SyncTTL` constant:
   ```go
   type RoomType string
   const (
     RoomTypeExchange RoomType = "exchange"
     RoomTypeSync     RoomType = "sync"
   )

   type Room struct {
     Code      string
     Type      RoomType
     Clients   map[string]*Client
     createdAt time.Time
     mu        sync.RWMutex
   }
   ```
   - Modify `IsExpired` to accept two TTLs:
     ```go
     func (r *Room) IsExpired(exchangeTTL, syncTTL time.Duration) bool {
       ttl := exchangeTTL
       if r.Type == RoomTypeSync {
         ttl = syncTTL
       }
       return time.Since(r.createdAt) > ttl
     }
     ```
2. **`relay/config.go`**: Add `SyncRoomTTL`:
   ```go
   type Config struct {
     Port          string
     RoomTTL       time.Duration
     SyncRoomTTL   time.Duration
     SweepInterval time.Duration
   }
   ```
   Default `SyncRoomTTL` to 24 hours. Add `SYNC_ROOM_TTL_HOURS` env var.
3. **`relay/message.go`**: Add new message types:
   ```go
   type InMessage struct {
     Type     string          `json:"type"`
     Code     json.RawMessage `json:"code,omitempty"`
     Data     json.RawMessage `json:"data,omitempty"`
     RoomType string          `json:"room_type,omitempty"` // "exchange" or "sync"
   }
   ```
4. **`relay/hub.go`**:
   - Modify `CreateRoom` to accept a `roomType` parameter:
     ```go
     func (h *Hub) CreateRoom(c *Client, roomType RoomType) string { ... }
     ```
   - When `roomType == RoomTypeSync`, allow the client to provide a custom code via `InMessage.Code`. If the code is already in use, return an error. If the code is new, create a sync room.
   - Add `CreateSyncRoom(c *Client, code string) string` that creates a room with the given code and `RoomTypeSync`.
   - Modify `JoinRoom` to work with sync rooms (they have longer codes).
   - Modify `unregister` to NOT delete sync rooms when all clients leave — let the sweeper handle expiry:
     ```go
     if c.room != nil {
       room := c.room
       other := room.Other(c)
       room.RemoveClient(c)
       if other != nil {
         other.Send(OutMessage{Type: "peer_left"})
       }
       // Only delete exchange rooms immediately; sync rooms persist for reconnection
       if room.Type == RoomTypeExchange {
         delete(h.rooms, room.Code)
       }
     }
     ```
   - Modify `handleMessage` to handle `create_room` with an optional `room_type` field:
     - If `room_type` is `"sync"` and `code` is provided, call `CreateSyncRoom`.
     - Otherwise, use existing `CreateRoom` behavior (exchange room).
   - Modify `RunSweep` to use both TTLs:
     ```go
     for code, room := range h.rooms {
       if room.IsExpired(h.config.RoomTTL, h.config.SyncRoomTTL) {
         // ...evict clients and delete room...
       }
     }
     ```
5. **`relay/handler.go`**: No changes needed — `handleMessage` already dispatches from `hub.go`.

**Implementation notes** (continued):
6. **Backward compatibility for existing tests**: The `CreateRoom` signature change from `(c *Client) string` to `(c *Client, roomType RoomType) string` and `IsExpired` from `(ttl time.Duration)` to `(exchangeTTL, syncTTL time.Duration) bool` are BREAKING. Two options:
   - **Option A (recommended)**: Keep `CreateRoom(c *Client) string` as-is for backward compatibility — it defaults to `RoomTypeExchange`. Add a new `CreateRoomWithType(c *Client, roomType RoomType) string` method. For `IsExpired`, keep the single-TTL version as a wrapper: `func (r *Room) IsExpiredTTL(ttl time.Duration) bool { return time.Since(r.createdAt) > ttl }` and add `IsExpiredWithSync(exchangeTTL, syncTTL time.Duration) bool`.
   - **Option B**: Update all existing callers and tests to use the new signatures.
   - The plan uses **Option A** for minimal disruption.

**Tests**:
- After implementation, run `cd relay && go test ./...` — all existing tests must pass unchanged.
- New behavior (sync rooms) is tested in Task 3.2.

**Commit**: `feat(relay): add sync room type with longer TTL and custom codes`

### Task 3.2: Add sync room integration tests to relay

**What**: Add Go tests for sync room creation, joining, and persistence behavior. Also update existing tests for any `IsExpired` call sites.

**Files**: `relay/hub_test.go` (modify)

**Implementation notes**:
1. Test creating a sync room with a custom code via `CreateRoomWithType(c, RoomTypeSync)` or `CreateSyncRoom(c, code)`.
2. Test that a sync room persists after all clients disconnect (check `hub.rooms` map still contains the code).
3. Test that a sync room is cleaned up after `SyncRoomTTL` expires.
4. Test that an exchange room is still cleaned up immediately on disconnect (same as existing `TestClientDisconnectSendsPeerLeft` behavior, which should still pass unchanged).
5. Test joining a sync room with the 16-char hex code.
6. If `IsExpired` signature changed, update `TestJoinExpiredRoomReturnsError` to use the new signature.

**Tests**:
- Test case A: `TestCreateSyncRoom` — create a room with a custom code, verify it exists in the hub with `RoomTypeSync`.
- Test case B: `TestSyncRoomPersistsAfterDisconnect` — create a sync room, connect and disconnect a client, verify room still exists in `hub.rooms`.
- Test case C: `TestSyncRoomExpiredBySweep` — create a sync room with short TTL, wait for sweep, verify it's removed.
- Test case D: `TestSyncRoomJoin` — create a sync room, join with correct code, verify `peer_joined` sent.
- Test case E: All existing tests (`TestCreateRoomReturnsFourCharCode`, `TestJoinRoomNotifiesBothPeers`, `TestJoinInvalidRoomReturnsError`, `TestJoinExpiredRoomReturnsError`, `TestClientDisconnectSendsPeerLeft`) continue passing unchanged.

**Commit**: `test(relay): add sync room integration tests`

### Task 3.3: Run all existing tests after relay changes

**What**: Verify no regressions in Go relay tests after the sync room changes.

**Steps**:
1. `cd relay && go test ./...`
2. Verify all existing tests pass: `TestCreateRoomReturnsFourCharCode`, `TestJoinRoomNotifiesBothPeers`, `TestJoinInvalidRoomReturnsError`, `TestJoinExpiredRoomReturnsError`, `TestClientDisconnectSendsPeerLeft`, `TestHealthHandler`.
3. If any test fails, fix the relay code (not the test) to maintain backward compatibility.

**Commit**: No commit — verification step only.

---

## Phase 4 — Client-Side Sync Hook

### Task 4.1: Create `useSyncSignaling` hook

**What**: A hook that extends the signaling logic to support sync rooms (custom room codes, reconnection behavior).

**Files**: `src/hooks/use-sync-signaling.ts` (new)

**Implementation notes**:
1. Create a hook modeled on `useSignaling` but specialized for sync:
   ```ts
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
     // Similar to useSignaling, but:
     // - connect(roomId) sends { type: "create_room", code: roomId, room_type: "sync" }
     // - On "room_created" → status "waiting"
     // - On "peer_joined" → status "paired"
     // - On "signal" → set remoteSignal
     // - On "peer_left" → status "waiting" (not "error" — peer may reconnect)
     // - On "error" → status "error"
     // ...
   }
   ```
2. Key difference from `useSignaling`: on `peer_left`, go back to `"waiting"` instead of `"error"`, since sync rooms persist and other devices may reconnect.
3. On calling `connect(roomId)`, the hook:
   - Opens WebSocket to `NEXT_PUBLIC_RELAY_URL`
   - Sends `{"type": "create_room", "code": roomId, "room_type": "sync"}`
   - If the room already exists with the same code and has a peer, the server sends `peer_joined`
   - If the room doesn't exist, it's created and the client waits for another device

**Tests**: Hook is tested via integration/E2E tests (manual verification with relay running).

**Commit**: `feat(sync): add useSyncSignaling hook`

### Task 4.2: Create `useSync` hook

**What**: The main auto-sync hook that orchestrates the full sync flow: connect to relay, exchange hello, transfer data, merge.

**Files**: `src/hooks/use-sync.ts` (new)

**Implementation notes**:
1. This hook manages the complete sync lifecycle:
   ```ts
   "use client";

   import { useCallback, useEffect, useRef, useState } from "react";
   import { getDb } from "@/db";
   import { loadSyncKey, getOrCreateDeviceId, storeLastSyncedAt } from "@/lib/sync-storage";
   import { validateSyncKey, mnemonicToRoomId } from "@/lib/sync-identity";
   import { useSyncSignaling } from "./use-sync-signaling";
   import { useWebRTCPeer } from "./use-webrtc-peer";
   import { exportFullSnapshot } from "@/lib/sync-serialize";
   import { importFullSnapshot } from "@/lib/sync-import";
   import { createTransferMessages } from "@/lib/exchange-chunk";
   import type { SyncHello, SyncComplete } from "@/lib/sync-protocol";
   import type { TransferStart, TransferChunk } from "@/lib/exchange-protocol";

   export type SyncStatus = "idle" | "connecting" | "waiting" | "syncing" | "complete" | "error";

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

     const chunksRef = useRef<string[]>([]);
     const peerInitiatorRef = useRef(false);

     const [signalingState, signalingActions] = useSyncSignaling();
     const [peerState, peerActions] = useWebRTCPeer({
       initiator: false, // will be set dynamically
       onSignal: useCallback((data: unknown) => {
         signalingActions.sendSignal(data);
       }, [signalingActions]),
     });

     // ... sync lifecycle logic
   }
   ```
2. The `startSync` function:
   a. Load sync key from localStorage via `loadSyncKey()`
   b. If no key, set status to "idle" — nothing to sync
   c. Validate key via `validateSyncKey()`
   d. Derive room ID via `mnemonicToRoomId()`
   e. Connect to relay via `signalingActions.connect(roomId)`
   f. On `signalingState.status === "paired"`, initiate WebRTC and exchange `SyncHello`
   g. The peer with fewer records (lower `dbVersion`) or older `exportedAt` sends a request
   h. The newer peer sends the full snapshot
   i. On completion, run `importFullSnapshot`, persist, and update `lastSyncedAt`
3. The hook should auto-start on mount if a sync key is stored.
4. On `peer_left`, the hook should go back to "waiting" (not error) to allow reconnection.
5. Data channel messages use the same `window.dispatchEvent(new CustomEvent('peer-data', ...))` pattern as the exchange center.

**Tests**: This hook is heavily integration-dependent. Verify manually via E2E.

**Commit**: `feat(sync): add useSync hook for auto-sync lifecycle`

---

## Phase 5 — UI: Sync Page

### Task 5.1: Create Sync page at top-level route

**What**: Create the sync settings page at `/sync` (top-level, not inside Exchange Center) with key generation, display, entry, and sync status.

**Files**:
- `src/app/(main)/sync/page.tsx` (new)

**Implementation notes**:
1. Create a `"use client"` page component with three states:
   - **No key stored**: Show a "Set Up Device Sync" section with:
     - A "Generate New Sync Key" button that calls `generateSyncKey()` and stores it
     - A "Enter Existing Key" section with a textarea for typing 12 words and a "Validate & Save" button
   - **Key stored**: Show the 12 words in a display grid (like BIP39 seed phrase displays), with:
     - A "Copy Key" button
     - A warning: "Write these words down. They are the only way to sync your data to another device."
     - A "Delete Key" button with confirmation dialog
   - **Sync status section**: Always visible when a key is stored:
     - Status indicator: "Not connected" | "Waiting for another device..." | "Syncing..." | "Sync complete" | "Error: ..."
     - Progress bar during sync (if `progress` is available)
     - "Sync Now" button to manually trigger
     - "Last synced: ..." timestamp when available
2. Use `useSync()` hook for state management.
3. Use existing UI components: `Button`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardDescription` from `@/components/ui/card`.
4. Use `toast` from `sonner` for notifications.
5. Import icons from `@remixicon/react`: `RiShieldKeyLine`, `RiLink`, `RiDeleteBinLine`, `RiRefreshLine`, `RiCheckLine`, `RiCopyLine`.
6. The word display should be a grid showing each word with its index number (1-12), styled like a seed phrase display.

**Tests**: Manual verification — generate key, copy key, delete key, sync between two browser tabs.

**Commit**: `feat(sync): add Sync page with key management UI`

### Task 5.2: Add Sync icon to main navbar

**What**: Add a Sync icon (arrows-in-circle) directly to the main navbar, linking to `/sync`. This is a top-level nav item, NOT inside Exchange Center.

**Files**:
- `src/components/navbar.tsx` (modify)
- `src/components/mobile-nav.tsx` (modify)

**Implementation notes**:
1. In `src/components/navbar.tsx`, add a Sync link in the desktop nav alongside Study Dome, Factory, Exchange Center. Use `RiLoopLeftLine` (arrows-in-circle icon) from `@remixicon/react`:
   ```tsx
   import { RiLoopLeftLine } from "@remixicon/react";
   // ... inside the <nav>:
   <Link href="/sync" className="text-muted-foreground transition-colors hover:text-foreground">
     <RiLoopLeftLine className="h-5 w-5" />
   </Link>
   ```
   The Sync link is an icon-only link (no text label), placed to the right of "Exchange Center" and before `<ModeToggle />`. On desktop it shows only the icon; on mobile it shows "Sync" text.

2. In `src/components/mobile-nav.tsx`, add a "Sync" entry to the `navLinks` array:
   ```ts
   const navLinks = [
     { label: "Study Dome", href: "/study-dome" },
     { label: "Factory", href: "/factory" },
     { label: "Exchange Center", href: "/exchange-center" },
     { label: "Sync", href: "/sync" },
   ] as const;
   ```

3. The desktop navbar displays the sync icon as a standalone icon link (no text) for compactness, consistent with how mode-toggle is icon-only. The mobile nav shows the full "Sync" text label.

**Tests**: Verify the Sync icon appears in the desktop navbar, and "Sync" appears in the mobile drawer. Verify clicking navigates to `/sync`.

**Commit**: `feat(nav): add Sync icon to navbar and mobile nav`

### Task 5.3: Add auto-sync on app startup

**What**: When a sync key is stored and the user visits the app, automatically attempt to connect to the sync room and start the sync process.

**Files**: `src/app/(main)/layout.tsx` (modify), `src/components/sync-provider.tsx` (new)

**Implementation notes**:
1. Create a new client component `src/components/sync-provider.tsx` that:
   - Calls `useSync()` on mount
   - Renders nothing (returns `null` or `{children}`)
   - The `useSync` hook already auto-starts when a key is stored
2. In `src/app/(main)/layout.tsx`, wrap the layout children with `<SyncProvider>`:
   ```tsx
   import { SyncProvider } from "@/components/sync-provider";
   
   export default function MainLayout({ children }) {
     return (
       <>
         <div className="min-h-screen max-h-screen h-screen overflow-y-auto">
           <Navbar />
           <main className="flex-1 flex flex-col overflow-y-auto">
             <SyncProvider>{children}</SyncProvider>
           </main>
         </div>
         <Footer />
       </>
     );
   }
   ```
3. The `SyncProvider` component should show a subtle toast notification when sync starts and completes, via `toast.info("Sync started")` and `toast.success("Sync complete")`.

**Tests**: Manual verification — open app in two browser tabs with same sync key, verify sync happens automatically.

**Commit**: `feat(sync): add auto-sync provider on app startup`

---

## Phase 6 — End-to-End Testing

### Task 6.1: Unit tests for sync-identity

**What**: Write unit tests for `sync-identity.ts` functions.

**Files**: `src/lib/__tests__/sync-identity.test.ts` (new)

**Tests**:
- `generateSyncKey` returns 12-space-separated words from the BIP39 English wordlist
- `validateSyncKey` accepts a valid generated mnemonic
- `validateSyncKey` rejects invalid mnemonics (wrong word count, non-BIP39 words)
- `mnemonicToRoomId` returns a 16-character hex string
- `mnemonicToRoomId` is deterministic (same input → same output)
- `normalizeMnemonic` tr, lowercases, and collapses whitespace

**Commit**: `test(sync): add sync-identity unit tests`

### Task 6.2: Unit tests for sync-serialize

**What**: Write unit tests for `sync-serialize.ts` functions.

**Files**: `src/lib/__tests__/sync-serialize.test.ts` (new)

**Tests**:
- `exportFullSnapshot` on an empty DB returns a snapshot with all arrays empty, `version: 1`, and a valid `deviceId`
- `exportFullSnapshot` on a populated DB includes all tables
- `countSnapshotRecords` returns the correct total

**Commit**: `test(sync): add sync-serialize unit tests`

### Task 6.3: Unit tests for sync-import

**What**: Write unit tests for `sync-import.ts` merge logic.

**Files**: `src/lib/__tests__/sync-import.test.ts` (new)

**Tests**:
- Importing an empty snapshot into an empty DB: all counts are 0
- Importing cards with tags into an empty DB: cards and tags are created
- Duplicate card detection: card with same `front + type` is updated (not duplicated)
- Card update with older `updatedAt`: skipped (local data wins)
- Bundle import: creates new bundles with correct card references
- Tag dedup: `getOrCreateTag` reuses existing tags
- card_fsrs update: updates FSRS state for existing cards
- review_logs import: appends without duplicates
- Invalid snapshot version: throws an error

**Commit**: `test(sync): add sync-import unit tests`

### Task 6.4: Unit tests for sync-storage

**What**: Write unit tests for `sync-storage.ts` localStorage helpers.

**Files**: `src/lib/__tests__/sync-storage.test.ts` (new)

**Tests**:
- `storeSyncKey` / `loadSyncKey`: store and retrieve a mnemonic
- `deleteSyncKey`: removes the key and last-synced timestamp
- `getOrCreateDeviceId`: generates and persists a UUID
- `storeLastSyncedAt` / `loadLastSyncedAt`: store and retrieve a timestamp

**Commit**: `test(sync): add sync-storage unit tests`

### Task 6.5: Run lint, typecheck, and unit tests

**What**: Run the full verification pipeline.

**Steps**:
1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`

Fix any issues before proceeding.

**Commit**: No commit — verification step only.

### Task 6.6: Manual E2E verification of sync flow

**What**: Verify the complete sync flow works end-to-end.

**Steps**:
1. Start the relay server: `cd relay && go run .`
2. Start the dev server: `pnpm dev`
3. Open browser tab A, click the Sync icon in the navbar
4. Click "Generate New Sync Key" → verify 12 words are displayed
5. Copy the 12 words
6. Open browser tab B (or different browser/incognito)
7. Click the Sync icon in the navbar of tab B
8. Paste the 12 words, click "Validate & Save"
9. Click "Sync Now" on both tabs
10. Verify that both tabs show "Sync complete" and the data matches
11. Add a card on tab A, sync again, verify it appears on tab B
12. Verify AI providers are NOT synced between tabs
13. Delete sync key on tab B, verify it disconnects

**Commit**: No commit — manual QA step.

---

## Execution Checklist

- [x] License — already present (EUPL v1.2). No action needed.
- [x] Docker/CI — skipped per user request.
- [x] Research phase completed — verified against real code (schema, services, exchange center, relay, hooks, BIP39 library, WebRTC patterns).
- [x] Every library reference traces to a verified source — `@scure/bip39` API verified, `crypto.subtle` verified, `simple-peer-light` API verified.
- [x] Every task has a `**Tests**` subsection (except pure UI tasks 5.1-5.3).
- [ ] E2E testing — Task 6.6 manual E2E verification (no Playwright E2E for this feature due to relay dependency).
- [x] Every task ends with a `**Commit**` line.
- [x] README not modified (stays slim).
- [x] All new source files are under `src/` or `relay/`.
- [x] Sync page is at `/sync` route (top-level), NOT inside Exchange Center.
- [x] Sync icon appears directly in the navbar (not in Exchange Center nav).
- [x] `pnpm add` used instead of `npx`.
- [x] No skills installation needed for this plan.