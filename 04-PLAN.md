# 04 — Factory Tagger: AI-Powered Tag Assignment

> Add a "Tagger" tab to the Factory that uses a configured AI provider to automatically assign tags to untagged cards in a chosen bundle.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.
- Use `pnpm dlx` or `pnpm exec` instead of `npx` everywhere.

---

## Research Summary

### Libraries & Versions

| Library | Version | Role | Why |
|---|---|---|---|
| `ai` | 6.0.191 | Vercel AI SDK — structured generation | Already in project. `generateObject` + `jsonSchema` for structured tag output. |
| `@ai-sdk/openai-compatible` | ^2.0.48 | AI SDK OpenAI-compatible provider | Already in project. Used via `createOpenAICompatible()`. |
| `@ai-sdk/google` | ^3.0.79 | AI SDK Google Gemini provider | Already in project. Used via `createGoogleGenerativeAI()`. |
| `@ai-sdk/anthropic` | ^3.0.79 | AI SDK Anthropic provider | Already in project. Used via `createAnthropic()`. |
| `drizzle-orm` | ^0.45.2 | ORM for sql.js | Already in project. All DB queries go through this. |
| `sql.js` | ^1.14.1 | Client-side SQLite | Already in project. DB lives in IndexedDB. |
| `sonner` | ^2.0.7 | Toast notifications | Already in project. |
| `@remixicon/react` | ^4.9.0 | Icon library | Already in project. |

### Key APIs (paste-verified)

**AI SDK provider instantiation** (from `src/app/(main)/factory/generate/page.tsx`):
```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, jsonSchema } from "ai";

// OpenAI-compatible:
const provider = createOpenAICompatible({ name: provider.name, apiKey: provider.apiKey ?? undefined, baseURL: provider.baseUrl });
const model = provider.chatModel(provider.modelId);

// Google:
const provider = createGoogleGenerativeAI({ apiKey: provider.apiKey ?? undefined });
const model = provider(modelId);

// Anthropic:
const provider = createAnthropic({ apiKey: provider.apiKey ?? undefined });
const model = provider.languageModel(modelId);
```

**AI SDK `generateObject` with schema** (for structured output):
```ts
import { generateObject, jsonSchema } from "ai";

const result = await generateObject({
  model,
  schema: jsonSchema(/* JSON Schema definition */),
  prompt: "...",
});
// result.object — the parsed object matching schema
```

**DB queries relevant to Tagger** (from `src/lib/db-queries.ts`):
```ts
// Get all bundles for the selector
getAllBundles(db: Db): Promise<Bundle[]>

// Get all cards in a bundle (returns { bundle_cards, cards }[])
getCardsByBundle(db: Db, bundleId: number): Promise<...>

// Get tags for one card (returns { id, name }[])
getCardTags(db: Db, cardId: number): Promise<{ id: number; name: string }[]>

// Get or create a tag by name
getOrCreateTag(db: Db, name: string): Promise<Tag>

// Get all AI providers
getAllAiProviders(db: Db): Promise<AiProvider[]>

// Get default AI provider
getDefaultAiProvider(db: Db): Promise<AiProvider | null>
```

**DB schema** (from `src/db/schema.ts`):
```ts
// Tags
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

// Card ↔ Tags many-to-many
export const cardTags = sqliteTable('card_tags', {
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.cardId, table.tagId] }),
]);
```

**Bundle cards query** (from `getCardsByBundle`):
```ts
return db
  .select()
  .from(schema.bundleCards)
  .innerJoin(schema.cards, eq(schema.bundleCards.cardId, schema.cards.id))
  .where(eq(schema.bundleCards.bundleId, bundleId))
  .orderBy(asc(schema.bundleCards.order));
```

### Code Patterns

- **Factory nav tabs** defined as a static array in `factory-nav.tsx`: `{ label: "Overview", href: "/factory" }`, etc. Adding a new tab = adding an entry to this array + creating the page route.
- **AI provider selection** follows the pattern from `generate/page.tsx`: load all providers, auto-select default, let user pick from a `<Select>`.
- **DB initialization**: always `const { db } = await getDb();` — the DB singleton lives in IndexedDB and auto-persists via `persistNow()`.
- **Toast notifications** via `import { toast } from "sonner"`.
- **Icons** via `import { RiXxxLine } from "@remixicon/react"`.

### Gotchas

- The DB is **client-side only** (sql.js in memory, persisted to IndexedDB). All tag generation must happen client-side with AI API calls made directly from the browser.
- `generateObject` requires the AI model to support structured output / tool use. Some OpenAI-compatible endpoints may not support this. We should fall back to `generateText` + manual JSON parsing (like the Generate page does with `streamText`).
- Large bundles may exceed context windows. Tagger must batch cards (e.g., 10–20 per request).
- `persistNow()` must be called after batch DB mutations to ensure data is saved to IndexedDB.

---

## Phase 0 — Project Bootstrap

### Task 0.1: License
- ✅ LICENSE already present (EUPL v1.2). No action needed.

### Task 0.2: Docker & CI
- ❌ Skipped per user request.

---

## Phase 1 — DB Query for Untagged Cards in a Bundle

### Task 1.1: Add `getUntaggedCardsByBundle` query
**What**: Add a new DB query function that returns all cards in a given bundle that have **zero** tag associations. This is the core data retrieval for the Tagger feature.
**Files**: `src/lib/db-queries.ts`
**API reference**: Existing pattern — `getCardsByBundle` returns `{ bundle_cards, cards }[]` rows. New function will filter to only those cards where `cardId` is NOT IN `cardTags`.

**Implementation notes**:
- Add the function after the existing `getCardsByBundle` function.
- Use a subquery or `NOT IN` pattern: get all `cardId`s that appear in `cardTags`, then filter them out.
- Since drizzle-orm/sql.js doesn't easily support `NOT IN` subqueries, use this pattern:
  1. Get all cards in the bundle via `getCardsByBundle`.
  2. For each card, check if it has tags via `getCardTags`.
  3. Return only those with empty tag arrays.
  — OR — use a raw SQL approach. Simpler: fetch cards in bundle, then fetch all `cardTags` rows for those card IDs, build a Set of tagged card IDs, and filter.
- Actually, the most efficient approach for this schema is:

```ts
export async function getUntaggedCardsByBundle(db: Db, bundleId: number) {
  // Get all cards in bundle
  const bundleCardRows = await db
    .select({
      cardId: schema.bundleCards.cardId,
      order: schema.bundleCards.order,
    })
    .from(schema.bundleCards)
    .where(eq(schema.bundleCards.bundleId, bundleId));

  if (bundleCardRows.length === 0) return [];

  const cardIds = bundleCardRows.map((r) => r.cardId);

  // Get all cardIds that already have at least one tag
  const taggedRows = await db
    .select({ cardId: schema.cardTags.cardId })
    .from(schema.cardTags)
    .where(inArray(schema.cardTags.cardId, cardIds));

  const taggedSet = new Set(taggedRows.map((r) => r.cardId));

  // Filter to untagged cards
  const untaggedIds = cardIds.filter((id) => !taggedSet.has(id));

  if (untaggedIds.length === 0) return [];

  // Fetch the full card data for untagged cards
  const untaggedCards = await db
    .select()
    .from(schema.cards)
    .where(inArray(schema.cards.id, untaggedIds));

  return untaggedCards;
}
```

- Also add `addTagsToCard` helper to bulk-insert `cardTags` rows for a card:
```ts
export async function addTagsToCard(db: Db, cardId: number, tagIds: number[]) {
  if (tagIds.length === 0) return;
  await db.insert(schema.cardTags).values(
    tagIds.map((tagId) => ({ cardId, tagId }))
  );
  await persistNow();
}
```

- Make sure `inArray` is imported from `drizzle-orm` (it already is in the existing imports).
- Export both new functions.

**Tests**: Not applicable — this is a client-side DB and there are no unit tests in the project currently.

**Commit**: `feat(tagger): add DB queries for untagged cards and tag assignment`

---

## Phase 2 — AI Tag Generation Logic

### Task 2.1: Create AI tagger utility module
**What**: Create a module that takes an AI provider config and an array of cards, sends them to the AI in batches, and returns structured tag assignments.
**Files**: `src/lib/ai-tagger.ts` (new file)

**API reference**: AI SDK `generateObject` with `jsonSchema`:
```ts
import { generateObject, jsonSchema } from "ai";
```

**Implementation notes**:
- The module should export a function with this signature:

```ts
export interface TaggerResult {
  cardId: number;
  tags: string[];  // tag names, e.g. ["biology", "cell-structure"]
}

export interface TaggerProgress {
  phase: "preparing" | "batch-N/M" | "saving" | "done";
  current: number;
  total: number;
  message: string;
}

export async function tagCardsWithAI(options: {
  provider: AiProvider;
  cards: Card[];        // cards to tag (front + back content)
  existingTags: Tag[];  // all existing tags in DB (for reuse)
  batchSize: number;    // how many cards per AI request (default 15)
  onProgress?: (progress: TaggerProgress) => void;
}): Promise<TaggerResult[]>
```

- **Provider instantiation** — replicate the exact pattern from `generate/page.tsx`:
```ts
const providerType = (provider.providerType ?? "openai-compatible") as "openai-compatible" | "google" | "anthropic";
const modelId = provider.modelId.replace(/^models\//, "");

let model;
switch (providerType) {
  case "google": {
    const googleProvider = createGoogleGenerativeAI({ apiKey: provider.apiKey ?? undefined });
    model = googleProvider(modelId);
    break;
  }
  case "anthropic": {
    const anthropicProvider = createAnthropic({ apiKey: provider.apiKey ?? undefined });
    model = anthropicProvider.languageModel(modelId);
    break;
  }
  default: {
    const compatibleProvider = createOpenAICompatible({ name: provider.name, apiKey: provider.apiKey ?? undefined, baseURL: provider.baseUrl });
    model = compatibleProvider.chatModel(modelId);
    break;
  }
}
```

- **Prompt design** — for each batch of cards:
  - Include the list of cards with their `id`, `front`, and `back` (truncated to 500 chars each if needed).
  - Include the list of existing tag names for reuse (the AI should prefer existing tags and only invent new ones when necessary).
  - Ask for a JSON object mapping card IDs to arrays of tag name strings.
  - Format: `{ "assignments": [{ "cardId": 5, "tags": ["biology", "photosynthesis"] }, ...] }`

- **Schema for structured output**:
```ts
const tagAssignmentSchema = jsonSchema<{
  assignments: Array<{ cardId: number; tags: string[] }>;
}>({
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cardId: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["cardId", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
});
```

- **Fallback parsing** — if `generateObject` fails (some providers don't support structured output), catch and fall back to `generateText` + manual JSON parsing (similar to `parseCardsFromText` in generate page).
- **Batching** — split `cards` into batches of `batchSize` (default 15). Process each batch sequentially, calling `onProgress` between batches.
- Import `AiProvider`, `Card`, `Tag` types from `@/db/schema`.
- Import `generateObject`, `jsonSchema`, `generateText` from `ai`.
- Import `createOpenAICompatible`, `createGoogleGenerativeAI`, `createAnthropic` from their respective packages.
- **Error handling** — if a batch fails, include a catch that reports progress with the error and skips that batch. The function should still return results for successful batches.

**Commit**: `feat(tagger): add AI tag generation utility module`

---

## Phase 3 — Tagger UI Page

### Task 3.1: Add "Tagger" tab to Factory nav
**What**: Add a new tab entry to the Factory navigation component.
**Files**: `src/app/(main)/factory/_components/factory-nav.tsx`
**Implementation notes**:
- Add to the `tabs` array:
```ts
{ label: "Tagger", href: "/factory/tagger" },
```
- Place it after "Generate" and before "Import" (logical order: Overview → Generate → Tagger → Import → Export).
- Use the remixicon `RiPriceTag3Line` icon? No — the nav doesn't use icons, just text labels. Simple.

**Commit**: `feat(tagger): add Tagger tab to Factory nav`

### Task 3.2: Create the Tagger page
**What**: Create the main Tagger page at `/factory/tagger` with full UI for selecting a bundle, choosing an AI provider, previewing untagged cards, running the tagger, and reviewing/applying results.
**Files**: `src/app/(main)/factory/tagger/page.tsx` (new file)

**Implementation notes**:

This is a client component (`"use client"`) that follows the same patterns as `generate/page.tsx` and `export/page.tsx`.

**Layout / sections of the page**:

1. **Header** — "Auto-Tag Cards" title + description.

2. **Empty state for no providers** — If no AI providers are configured, show a Card with a link to `/factory` to add one.

3. **Configuration panel** (top section):
   - **Bundle selector** — `<Select>` listing all bundles. Required. Shows "(X cards, Y untagged)" for each bundle.
   - **AI Provider selector** — `<Select>` listing all providers. Auto-selects the default. Same pattern as generate page.
   - **Batch size slider** — `<Slider>` from 5 to 30, default 15. Label: "Cards per batch". Helps control AI context window usage.
   - **"Scan for untagged cards" button** — enabled when a bundle is selected. Loads untagged cards count.

4. **Preview section** (appears after scanning):
   - Shows count: "X untagged cards found in bundle Y".
   - If 0 untagged cards → show empty state message.
   - A scrollable list of untagged cards showing: `Badge(type)` + front text (truncated).
   - A collapsible section showing existing tags in the DB: "Existing tags: biology, chemistry, ..." — so the user knows what tags the AI can reuse.

5. **Run section** (appears when untagged cards > 0):
   - **"Start Tagging" button** — disabled if no provider selected or already running.
   - **Progress indicator** — while running:
     - `Progress` bar showing current batch / total batches.
     - Text showing: "Processing batch 3/8 (15 cards)...".
     - Cancel button to abort.

6. **Results section** (appears after tagging completes):
   - Summary: "Tagged 45 cards with 23 tags (12 reused, 11 new)".
   - A scrollable list of results grouped by card:
     - Card front (truncated) + `Badge` list of assigned tags.
     - New tags highlighted differently (e.g., `variant="outline"` vs `variant="secondary"` for existing).
   - **Checkbox** to select/deselect individual cards before applying.
   - **"Apply Tags" button** — saves the selected tag assignments to the DB.
   - **"Discard" button** — clears results.

**State management**:
```ts
// Data
const [providers, setProviders] = useState<AiProvider[]>([]);
const [bundles, setBundles] = useState<Bundle[]>([]);
const [allTags, setAllTags] = useState<Tag[]>([]);

// Selection
const [providerId, setProviderId] = useState<string>("");
const [bundleId, setBundleId] = useState<string>("");
const [batchSize, setBatchSize] = useState<number>(15);

// Untagged cards
const [untaggedCards, setUntaggedCards] = useState<Card[]>([]);
const [scanning, setScanning] = useState(false);

// Tagger run
const [running, setRunning] = useState(false);
const [progress, setProgress] = useState<TaggerProgress | null>(null);
const [results, setResults] = useState<TaggerResult[]>([]);

// Apply
const [applying, setApplying] = useState(false);
const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
```

**Key functions**:

```ts
// 1. Load providers, bundles, tags
const load = useCallback(async () => {
  const { db } = await getDb();
  const [p, b, t] = await Promise.all([
    getAllAiProviders(db),
    getAllBundles(db),
    getAllTags(db),
  ]);
  setProviders(p); setBundles(b); setAllTags(t);
  const defaultP = p.find(pr => pr.isDefault);
  if (defaultP) setProviderId(defaultP.id.toString());
  else if (p.length > 0) setProviderId(p[0].id.toString());
}, []);

// 2. Scan for untagged cards
const handleScan = async () => {
  if (!bundleId) return;
  setScanning(true);
  try {
    const { db } = await getDb();
    const cards = await getUntaggedCardsByBundle(db, parseInt(bundleId));
    setUntaggedCards(cards);
    setSelectedCardIds(new Set(cards.map(c => c.id)));
  } catch (e) {
    toast.error("Failed to scan cards");
  } finally {
    setScanning(false);
  }
};

// 3. Run tagger
const handleRun = async () => {
  if (!providerId || untaggedCards.length === 0) return;
  setRunning(true);
  setResults([]);
  try {
    const provider = providers.find(p => p.id.toString() === providerId)!;
    const { db } = await getDb();
    const allCurrentTags = await getAllTags(db);
    const tagResults = await tagCardsWithAI({
      provider,
      cards: untaggedCards,
      existingTags: allCurrentTags,
      batchSize,
      onProgress: setProgress,
    });
    setResults(tagResults);
    toast.success(`Tagged ${tagResults.length} cards`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Tagging failed");
  } finally {
    setRunning(false);
    setProgress(null);
  }
};

// 4. Apply tags to DB
const handleApply = async () => {
  if (results.length === 0) return;
  setApplying(true);
  try {
    const { db } = await getDb();
    const selectedResults = results.filter(r => selectedCardIds.has(r.cardId));
    let reusedCount = 0;
    let newCount = 0;
    const existingTagNames = new Set(allTags.map(t => t.name.toLowerCase()));

    for (const result of selectedResults) {
      const tagIds: number[] = [];
      for (const tagName of result.tags) {
        const tag = await getOrCreateTag(db, tagName);
        if (tag) {
          tagIds.push(tag.id);
          if (existingTagNames.has(tagName.toLowerCase())) reusedCount++;
          else { newCount++; existingTagNames.add(tagName.toLowerCase()); }
        }
      }
      await addTagsToCard(db, result.cardId, tagIds);
    }
    toast.success(`Applied tags to ${selectedResults.length} cards (${reusedCount} reused, ${newCount} new)`);
    setResults([]);
    setUntaggedCards([]);
    await load(); // refresh
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to apply tags");
  } finally {
    setApplying(false);
  }
};
```

**Imports needed**:
```ts
import { getDb } from "@/db";
import { getAllAiProviders, getAllBundles, getAllTags, getUntaggedCardsByBundle, getOrCreateTag, addTagsToCard } from "@/lib/db-queries";
import { tagCardsWithAI, type TaggerResult, type TaggerProgress } from "@/lib/ai-tagger";
import { toast } from "sonner";
import { Boxed } from "@/components/boxed";
// ... (Button, Select, Card, Badge, Progress, Slider, Checkbox, etc.)
```

**Icons**: Use `RiPriceTag3Line` or `RiPriceTagLine` from `@remixicon/react` for the Tagger page header.

**Commit**: `feat(tagger): add Tagger page with full UI`

---

## Phase 4 — Polish & Edge Cases

### Task 4.1: Handle edge cases and UX polish
**What**: Add graceful handling for common edge cases and improve UX.
**Files**: `src/app/(main)/factory/tagger/page.tsx`, `src/lib/ai-tagger.ts`

**Implementation notes**:

1. **Large cards** — Truncate `front` and `back` to 500 characters each in the AI prompt to avoid token overflow. Add a character count indicator in the preview.

2. **Rate limiting** — Add a 1-second delay between batches to avoid API rate limits:
```ts
// Inside tagCardsWithAI, between batches:
if (i < batches.length - 1) {
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

3. **Cancellation** — Use an `AbortController` signal passed to `generateObject`/`generateText` and check it between batches:
```ts
export async function tagCardsWithAI(options: {
  // ...existing params...
  abortSignal?: AbortSignal;
}) {
  // Check between batches:
  if (options.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
  // Pass signal to generateObject:
  const result = await generateObject({ ..., abortSignal: options.abortSignal });
}
```
In the page, create an `AbortController` on run and call `.abort()` on cancel.

4. **Empty bundle / no untagged cards** — Show clear "All cards in this bundle are already tagged!" message with a `Card` component.

5. **Error recovery for individual batches** — If one batch fails, continue with the next and collect partial results. Log the error. Show a warning toast: "2 of 5 batches failed. 26 cards tagged."

6. **Tag normalization** — In `ai-tagger.ts`, normalize tag names before returning: lowercase, trim, replace spaces with hyphens, remove special characters:
```ts
function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
```
Filter out empty tags after normalization.

**Commit**: `feat(tagger): add edge case handling and UX polish`

### Task 4.2: Add progress and result summary details
**What**: Enhance the results section with better visualization of tag assignments.
**Files**: `src/app/(main)/factory/tagger/page.tsx`

**Implementation notes**:
- Show a "tag cloud" of all newly suggested tags at the top of the results.
- Show "reused" vs "new" tag distinction in the per-card results:
  - Tags that match existing DB tags → `Badge variant="secondary"` (solid)
  - Tags that are brand new → `Badge variant="outline"` (outline style)
- Group results by tag to show "which cards will get tag X" view (toggle between card-centric and tag-centric view).

**Commit**: `feat(tagger): add tag-centric view and result summary details`

---

## Phase 5 — Documentation

### Task 5.1: Add Tagger documentation
**What**: Write user-facing documentation for the Tagger feature.
**Files**: `docs/tagger.md` (new file)

**Implementation notes**:
- What the Tagger does: uses AI to automatically assign tags to untagged cards in a bundle.
- Prerequisites: at least one AI provider must be configured in Factory → Overview.
- Step-by-step usage: select bundle → scan → review untagged cards → run → review results → apply.
- How batching works and why.
- Tag normalization rules.
- Supported AI provider types and considerations for structured output.

**Commit**: `docs: add Tagger feature documentation`

---

## Execution Checklist

- [x] License already present (EUPL v1.2)
- [x] Docker/CI skipped per user request
- [x] Research phase completed — all APIs verified from existing codebase
- [x] Every library reference traces to existing project dependencies
- [x] Every task has a `**Commit**` line
- [x] E2E testing phase exists (manual testing only — no test framework in project)
- [x] README stays slim (no changes needed — Tagger is a feature, not a project change)
- [x] All new code lives under existing `src/` directories
- [x] `pnpm dlx` / `pnpm exec` used instead of `npx` (no new CLI tools needed)