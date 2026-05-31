# Factory Tagger

The **Tagger** is a tool in the AI Factory that uses AI to automatically assign tags to untagged flashcards in a bundle.

## Prerequisites

- At least one AI provider must be configured in **Factory → Overview**.
- A bundle with untagged cards.

## How It Works

1. **Select a bundle** — Choose the bundle whose cards you want to tag.
2. **Scan** — The tagger queries the database for cards in the bundle that have zero tag associations.
3. **Configure** — Select an AI provider and set the batch size.
4. **Run** — Cards are sent to the AI in batches. Each batch is processed sequentially with a 1-second delay between batches to avoid rate limits.
5. **Review** — The AI's tag suggestions are displayed grouped by card or by tag. New tags are shown with a distinct badge style (outline) vs reused tags (solid).
6. **Apply** — Select which cards to apply tags to, then click "Apply Tags". Tags are created in the database (or reused if they already exist).

## Batching

Cards are processed in batches (default 15, configurable 5–30). Batching serves two purposes:

- **Context window management** — Large bundles may exceed the AI model's context window. Smaller batches avoid truncation.
- **Better tag reuse** — Each batch includes the existing tag names plus any new tags created by previous batches.

## Tag Normalization

All tag names from the AI are normalized before storing:

- Trimmed of whitespace
- Lowercased
- Spaces replaced with hyphens
- Only alphanumeric characters and hyphens are kept
- Consecutive hyphens collapsed

For example: `"Cell Biology"` → `"cell-biology"`, `"Photosynthesis!!"` → `"photosynthesis"`

## AI Provider Support

The Tagger supports the same providers as the Generate page:

- **OpenAI-compatible** (OpenAI, Ollama, OpenRouter, etc.)
- **Google Gemini**
- **Anthropic Claude**

Structured output (`generateObject`) is attempted first. If the provider doesn't support it, the tagger falls back to plain text generation with JSON extraction — similar to the Generate page's fallback mechanism.

## Views

### Card View (default)

Shows each card with its assigned tags. Checkboxes let you select/deselect individual cards before applying.

### Tag View

Groups cards by assigned tag, showing which cards will receive each tag. Useful for understanding the overall tag distribution.

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  tagger/page.tsx  │────►│  lib/ai-tagger.ts    │────►│  lib/db-queries  │
│  (UI + state)     │     │  (AI batching logic) │     │  (DB helpers)    │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
                              │
                              ▼
                         AI SDK (ai/*)
                              │
                              ▼
                         AI Provider API
```

## Related

- `src/lib/db-queries.ts` — `getUntaggedCardsByBundle()`, `addTagsToCard()`
- `src/lib/ai-tagger.ts` — `tagCardsWithAI()`, `TaggerResult`, `TaggerProgress`
- `src/app/(main)/factory/tagger/page.tsx` — Full UI component
