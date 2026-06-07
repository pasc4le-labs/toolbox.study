# 01 — Replace SQT Parser with UQF Parser Plan

> Replace the legacy SQT-only text import parser with a UQF (Universal Quiz Format) parser that is a strict superset of SQT, adds English/Markdown triggers, supports open questions and multi-correct answers, preserves multi-line text with LaTeX/Markdown, and integrates seamlessly into the existing Import page.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Current parser** | `src/lib/sqt-parser.ts` — 139 lines, state machine over lines, outputs `SqtCard[]` with `type: "multi_radio"` only. 22 unit tests in `src/lib/__tests__/sqt-parser.test.ts`. |
| **Import page** | `src/app/(main)/factory/import/page.tsx` — 600-line `"use client"` component with two modes: `"json"` and `"sqt"`. SQT mode uses `parseSqt()`, shows preview, imports via `createCard()` with hardcoded `type: "multi_radio"`. |
| **DB schema** | `src/db/schema.ts` — `cards` table supports `type: 'multi_radio' | 'multi_select' | 'open' | 'knowledge'`. `options` and `correctIndices` stored as JSON strings (nullable). `back` is always a `text NOT NULL`. |
| **Card service** | `src/lib/services/card.ts` — `createCard(db, { type, front, back, explanation, options, correctIndices, tagIds, bundleIds })`. `options` and `correctIndices` are `JSON.stringify()`'d on insert. |
| **E2E tests** | `e2e/import-export.spec.ts` — has `"SQT import creates multi_radio cards correctly"` test at line 266. Uses `.txt` file input with `accept=".txt,text/plain"`. |
| **Integration tests** | `src/__tests__/integration/import-export-roundtrip.test.ts` — tests JSON exchange round-trip, no SQT round-trip tests. |
| **Card types** | `multi_radio` = single correct option, `multi_select` = multiple correct options, `open` = no options, `knowledge` = simple front/back. UQF maps to `open`, `multi_radio`, or `multi_select`. |
| **Existing exports** | `src/lib/exchange-serialize.ts` / `src/lib/exchange-import.ts` — JSON-based P2P exchange, separate from text import. Not affected by this change. |

### Triggers (from UQF spec)

| Block | Triggers (case-insensitive) | Notes |
|-------|-----|-------|
| **Question** | `Esercizio N.` (legacy), `Question:`, `Q:` | Starts a new card. Text after trigger is first line of question. |
| **Option** | `[Letter])` or `[Letter].` with optional leading `- ` or `* ` and optional `**` bold | e.g. `A)`, `B.`, `- A)`, `*B)`, `**A)**`. Captures letter and text. |
| **Answer** | `Risposta:` (legacy), `Answer:`, `Answers:` | For closed: letter(s) comma-separated (e.g. `A, C`). For open: multi-line text. |
| **Explanation** | `Commento:` (legacy), `Explanation:`, `Exp:` | Optional. Multi-line text preserved. |
| **Separator** | `---` | Saves current card, transitions to IDLE. Not a question trigger — just terminates the current card. |

### Card type inference

- Options detected between Question and Answer → closed question
  - Single correct answer → `multi_radio`
  - Multiple correct answers → `multi_select`
- No options detected → `open` question

### Key differences from old SQT parser

| Aspect | Old SQT | New UQF |
|--------|---------|---------|
| Question trigger | `Esercizio N.` only | `Esercizio N.`, `Question:`, `Q:`, `---` separator |
| Answer trigger | `Risposta:` only | `Risposta:`, `Answer:`, `Answers:` |
| Explanation trigger | `Commento:` only (single-line) | `Commento:`, `Explanation:`, `Exp:` (multi-line) |
| Options | `A)` format only | `A)`, `A.`, with LLM tolerance for `-`, `*`, `**` |
| Card types | `multi_radio` only | `open`, `multi_radio`, `multi_select` |
| Multi-line | Joins question with space | Preserves `\n` line breaks |
| Multi-answer | Not supported | Comma-separated letters: `Answer: A, C` |
| `back` field | Option text of correct answer | Open: answer text; Closed: option text(s) joined by `, ` |
| `---` separator | Not supported | Saves current card, starts fresh |

---

## Phase 1 — UQF Parser Module

### Task 1.1: Create UQF parser with types and state machine

**What**: Create `src/lib/uqf-parser.ts` containing the full UQF parser — types, state machine, and `parseUqf()` function. The parser must be a strict superset of the existing SQT parser (every valid SQT input must produce identical output, modulo the `type` field which changes from the literal `"multi_radio"` string to a computed `"open" | "multi_radio" | "multi_select"`).

**Files**: `src/lib/uqf-parser.ts` (new)

**API reference** (verified from existing `src/lib/sqt-parser.ts` and `src/db/schema.ts`):

Existing `SqtCard` type (to be superseded):
```ts
// src/lib/sqt-parser.ts:18-26
export interface SqtCard {
  type: "multi_radio";
  front: string;
  back: string;
  explanation: string | null;
  options: string[];
  correctIndices: number[];
  tags: string[];
}
```

DB card types (from `src/db/schema.ts:9`):
```ts
type: text('type', { enum: ['multi_radio', 'multi_select', 'open', 'knowledge'] }).notNull()
```

`createCard` signature (from `src/lib/services/card.ts:7-18`):
```ts
export async function createCard(
  db: Db,
  data: {
    type: 'multi_radio' | 'multi_select' | 'open' | 'knowledge';
    front: string;
    back: string;
    explanation?: string | null;
    options?: string[] | null;
    correctIndices?: number[] | null;
    tagIds?: number[];
    bundleIds?: number[];
  },
)
```

**New types to define in `src/lib/uqf-parser.ts`**:

```ts
export type UqfCardType = "open" | "multi_radio" | "multi_select";

export interface UqfOption {
  letter: string;   // "A", "B", etc.
  text: string;      // option text (trimmed, may contain newlines for multi-line)
}

export interface UqfCard {
  type: UqfCardType;
  front: string;                // question text, newlines preserved
  back: string;                 // open: full answer text; closed: correct option text(s) joined by ", "
  explanation: string | null;   // null if no explanation block
  options: string[] | null;     // null for open; string[] for closed (option texts)
  correctIndices: number[] | null; // null for open; number[] for closed (0-based)
  tags: string[];               // always empty [] for now (future: tag extraction)
}

export interface UqfParseResult {
  cards: UqfCard[];
  errors: string[];
  warnings: string[];
}
```

**Implementation notes**:

1. **Line normalization**: Same as SQT parser — replace `\r\n` with `\n`, `\r` with `\n`, then split on `\n`.

2. **State machine**: Use a `currentState` variable with values `'IDLE' | 'QUESTION' | 'OPTION' | 'ANSWER' | 'EXPLANATION'`.

3. **Regex patterns** (verified from UQF spec):
   - Question trigger: `/^(?:Esercizio\s+\d+\.|Question:|Q:)\s*(.*)/i` — captures optional text after trigger as start of question.
   - Option trigger: `/^(?:[-*]\s*)?(?:\*\*)?([A-Z])[)\.](?:\*\*)?\s*(.*)/` — captures letter and text. Note: case-sensitive for the letter (A-Z only, as the spec uses uppercase letters). The regex handles `- A)`, `*B)`, `**A)**`, `A.`, `B)` etc.
   - Answer trigger: `/^(?:Risposta:|Answers?:)\s*(.*)/i` — captures text after trigger. Handles `Answer:` and `Answers:` (the `s?` makes the `s` optional).
   - Explanation trigger: `/^(?:Commento:|Explanation:|Exp:)\s*(.*)/i` — captures text after trigger.
   - Separator: `/^---+\s*$/` — three or more dashes alone on a line (allows `---`, `----`, etc. with optional trailing whitespace).

4. **Processing loop** (line by line):
   ```
   for each line (trimmed-right, not trimmed-left for continuation):
     if line matches question trigger:
       save current card (if any with non-empty front)
       start new card, state = QUESTION
       append captured text to question buffer
     else if line matches option trigger (and current state is QUESTION or OPTION):
       state = OPTION
       record option letter and text
     else if line matches answer trigger:
       state = ANSWER
       append captured text to answer buffer
     else if line matches explanation trigger:
       state = EXPLANATION
       append captured text to explanation buffer
     else if line matches separator (---):
       save current card (if any)
       reset state to IDLE
     else if current state is not IDLE:
       append raw line (after right-trimming only) to current state's buffer with \n prefix
       (preserve original indentation for continuation lines)
   ```

5. **Saving a card**: When saving a card:
   - If `front` is empty/whitespace-only after trimming: push error, skip card.
   - If options were found (closed question):
     - Parse answer letters (comma-separated, trimmed, case-insensitive, e.g. `"A, C"`)
     - Map each letter to a 0-based index (A=0, B=1, ...)
     - Validate indices against options length
     - If no valid answer letters: push error, set `correctIndices: []`
     - If single correct answer: `type: "multi_radio"`
     - If multiple correct answers: `type: "multi_select"`
     - `back` = correct option texts joined by `", "`; if no valid indices, `back` = front text
     - `options` = array of option texts
     - `correctIndices` = array of valid indices
   - If no options (open question):
     - `type: "open"`
     - `back` = answer text (everything after `Answer:`/`Risposta:`, multi-line preserved)
     - `options: null`
     - `correctIndices: null`
     - If no Answer block found: push error, `back: ""`
   - `explanation` = explanation text if provided, else `null`
   - `tags: []`

6. **After loop finishes**: Save the last card (if any) using the same logic.

7. **Multi-line continuation**: When appending continuation lines, preserve them with `\n` as separator. Do NOT trim left whitespace (important for Markdown/LaTeX preservation). Right-trim each line.

8. **Backwards compatibility**: For legacy SQT input (`Esercizio N.` / `Risposta:` / `Commento:`), the parser must produce the exact same output as the old `parseSqt()` function, with these differences:
   - `type` will be `"multi_radio"` instead of the literal string `"multi_radio"` — same value, but now dynamically computed.
   - `front` will use `\n` as the joiner instead of space when there are multi-line questions. This is a **breaking change** from the old parser. Document it.
   - For the common case of single-line questions, output is identical.

9. **The `---` separator** acts as a card terminator only (transitions to IDLE, not to QUESTION). This differs slightly from the UQF spec's implementation guide (which says it transitions to QUESTION) but avoids creating phantom empty cards. The next question trigger (`Esercizio`, `Question:`, `Q:`) starts the next card from IDLE state.

10. **Empty/whitespace-only lines in continuation**: These are preserved as part of multi-line content. They do NOT trigger state transitions.

**Tests**: Not yet — tests come in Phase 2.

**Commit**: `feat(uqf): add UQF parser module`

---

## Phase 2 — UQF Parser Unit Tests

### Task 2.1: SQT backward-compatibility tests

**What**: Write unit tests in `src/lib/__tests__/uqf-parser.test.ts` that mirror every test case from `src/lib/__tests__/sqt-parser.test.ts` to verify 100% backward compatibility with legacy SQT input.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (new)

**Tests** (each mirrors a test from the SQT test suite):
- `"parses a single exercise with all fields"` — `Esercizio 1.` + `Risposta:` + `Commento:`
- `"parses multiple exercises in one text"` — two `Esercizio` blocks
- `"normalizes \\r\\n and \\r line endings"` — same CRLF/CR/LF test
- `"parses exercise with 4 options (D)"` — A-D options
- `"reports error for empty question text"` — `Esercizio` with no question
- `"reports error when no options are found"` — `Esercizio` + `Risposta:` without options → now treated as **open question** (no options detected). This is a behavioral change from SQT. The old parser skipped such cards with an error; the UQF parser treats them as open questions. Verify this works correctly.
- `"reports error when answer letter is out of range"` — `Risposta: Z` with only A-B options
- `"reports error when answer line is missing"` — `Esercizio` with options but no `Risposta:`

**Important behavioral note**: In the old SQT parser, "no options found" was an error and the card was skipped. In the UQF parser, if no option triggers are detected between Question and Answer, the card is treated as an **open** question. The test for "no options" must be updated:
- Old behavior: `Esercizio 1.\nA question with no options.\nRisposta: A` → error, skipped
- New behavior: same input → `type: "open"`, `front: "A question with no options."`, `back: "A"`, `options: null`, `correctIndices: null`

**Commit**: `test(uqf): add SQT backward-compatibility tests`

### Task 2.2: New UQF format tests (Question:, Q:, Answer:, Explanation:)

**What**: Test the new English/Markdown triggers that UQF adds beyond SQT.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"parses Question: trigger"` — `Question: What is the capital of France?\nA) Paris\nB) London\nAnswer: A`
- `"parses Q: trigger"` — `Q: What is 2+2?\nA) 4\nB) 5\nAnswer: A`
- `"parses Answer: trigger"` — Uses `Answer:` instead of `Risposta:`
- `"parses Answers: trigger (comma-separated letters)"` — `Answers: A, C` — `type: "multi_select"`, `correctIndices: [0, 2]`
- `"parses Explanation: trigger"` — Uses `Explanation:` instead of `Commento:`
- `"parses Exp: trigger"` — Uses `Exp:` shorthand
- `"case-insensitive triggers"` — `QUESTION:`, `q:`, `ANSWER:`, `EXPLANATION:` all work
- `"Q: followed by multi-line question text"` — Multiple non-trigger lines after `Q:` appended with `\n`

**Commit**: `test(uqf): add new format trigger tests`

### Task 2.3: Open question tests

**What**: Test parsing of open questions (no options between Question and Answer blocks).

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"parses open question with Answer: block"` — `Q:\nExplain TCP.\n\nAnswer:\nTCP is connection-oriented.` → `type: "open"`, `back: "TCP is connection-oriented."`, `options: null`, `correctIndices: null`
- `"parses open question with multi-line answer"` — Multi-line Answer block with `\n` preserved in `back`
- `"parses open question with Risposta: (legacy)"` — `Esercizio 1.\nExplain X\nRisposta: Y` with no options → open
- `"parses open question with explanation after answer"` — `Q:\n...\nAnswer:\n...\nExp:\n...`
- `"open question with no answer produces error and empty back"` — `Q: What?\n\n---` with no Answer block

**Commit**: `test(uqf): add open question tests`

### Task 2.4: Multi-line content, LaTeX, and Markdown tests

**What**: Test that multi-line question text, answers, and explanations preserve newlines, and that LaTeX and Markdown pass through unmodified.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"multi-line question text preserves newlines"` — `Q:\nFirst line\nSecond line\nA) Option\nAnswer: A` → `front` contains `First line\nSecond line`
- `"LaTeX inline math in question"` — `Q: What is $x^2$?\nA) 1\nB) $x^2$\nAnswer: B` → option text contains `$x^2$`
- `"LaTeX display math in answer"` — `Q:\nDerive the quadratic formula.\nAnswer:\nThe formula is:\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`
- `"Markdown bold in options"` — `Q: Which are correct?\n**A)** Option A\n**B)** Option B\nAnswer: A` → LLM-tolerant option parsing strips `**` wrapper but preserves inner text
- `"Markdown code blocks in explanation"` — Explanation block containing `` `code` `` and ``` blocks
- `"multi-line answer for open question preserves newlines"` — `Answer:\nLine 1\nLine 2\nLine 3` → `back` is `"Line 1\nLine 2\nLine 3"`

**Commit**: `test(uqf): add multi-line and LaTeX tests`

### Task 2.5: Multi-answer (multi_select) tests

**What**: Test that comma-separated answer letters produce `multi_select` cards with multiple `correctIndices`.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"parses multi-answer with Answers: A, C"` — `Answers: A, C` with 4 options → `type: "multi_select"`, `correctIndices: [0, 2]`, `back: "optA, optC"`
- `"parses multi-answer with Answer: A, B, D"` — `Answer:` (singular) also accepts comma-separated letters
- `"single answer still produces multi_radio"` — `Answer: B` with options → `type: "multi_radio"`, `correctIndices: [1]`
- `"multi-answer with whitespace variations"` — `Answers: A,C`, `Answers: A , C`, `Answers:  A  ,  D  ` — all parsed correctly
- `"multi-answer out-of-range letters produce errors"` — `Answers: A, Z` with only A-D options → error for Z, `correctIndices: [0]`

**Commit**: `test(uqf): add multi-answer tests`

### Task 2.6: Separator and edge case tests

**What**: Test `---` separators and various edge cases.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"--- separator ends current card"` — Two cards separated by `---`
- `"--- with extra dashes still works"` — `----`, `-----` all work
- `"--- between Q: blocks with blank lines"` — Cards separated by `---` and blank lines
- `"multiple --- in a row"` — Consecutive `---` lines don't create extra cards
- `"empty input returns empty result"` — `""` → `{ cards: [], errors: [], warnings: [] }`
- `"input without any triggers returns empty result"` — Plain text with no triggers
- `"trailing content after last answer is treated as explanation"` — After `Answer:`, non-matching lines append to answer until Explanation trigger or next card
- `"option letters in non-alphabetical order"` — `C) Option\nA) Option\nB) Option` — options recorded in order of appearance
- `"mixed triggers in same file"` — `Esercizio 1.` followed by `Q:` followed by `Question:` — all parsed correctly

**Commit**: `test(uqf): add separator and edge case tests`

### Task 2.7: LLM tolerance tests

**What**: Test the option parsing regex handles common LLM formatting quirks.

**Files**: `src/lib/__tests__/uqf-parser.test.ts` (modify, append tests)

**Tests**:
- `"option with dash prefix: - A) text"` — Markdown list style
- `"option with asterisk prefix: * B) text"` — Markdown unordered list style
- `"option with bold wrapper: **A)** text"` — Bold letter
- `"option with bold wrapper and period: **C.** text"` — Bold period format
- `"option with period instead of paren: D. text"` — Period separator
- `"option with bold and period: **D.** text"` — Combined bold + period
- `"option with leading whitespace and list marker: - **A)** text"` — Dash + bold + paren
- `"option text preserves content after the trigger"` — Including `**`, `$`, `` ` ``, etc.

**Commit**: `test(uqf): add LLM tolerance tests`

---

## Phase 3 — Run UQF Parser Tests and Fix

### Task 3.1: Run all UQF parser unit tests, fix any failures

**What**: Run `pnpm test -- src/lib/__tests__/uqf-parser.test.ts` and `pnpm typecheck`. Fix any type errors or test failures in the UQF parser.

**Files**: `src/lib/uqf-parser.ts`, `src/lib/__tests__/uqf-parser.test.ts` (modify if needed)

**Tests**: All tests from Phase 2 must pass.

**Commit**: `fix(uqf): resolve test failures` (only if fixes needed; skip commit if all pass)

---

## Phase 4 — Update Import Page

### Task 4.1: Replace SQT mode with UQF mode in import page

**What**: Update `src/app/(main)/factory/import/page.tsx` to replace the SQT import mode with UQF mode. This involves:
1. Change `ImportMode` type from `"json" | "sqt"` to `"json" | "uqf"`.
2. Replace `import { parseSqt, type SqtCard } from "@/lib/sqt-parser"` with `import { parseUqf, type UqfCard } from "@/lib/uqf-parser"`.
3. Replace all SQT-related state variables with UQF equivalents.
4. Update the `handleSqtFile` handler to `handleUqfFile` — call `parseUqf(text)` instead of `parseSqt(text)`.
5. Update the `handleSqtImport` handler to `handleUqfImport` — iterate over `UqfCard[]` and call `createCard()` with the correct `type` derived from each card (not hardcoded `"multi_radio"`).
6. Update the mode tab button text from "SQT Import" to "UQF Import" with appropriate icon.
7. Update file input `accept` attribute from `.txt,text/plain` to `.txt,.md,text/plain,text/markdown` (UQF supports Markdown).
8. Update the help text and format example to show the full UQF syntax.

**Files**: `src/app/(main)/factory/import/page.tsx` (modify)

**Implementation notes for the import handler** (verified from `src/lib/services/card.ts:7-18` and `src/db/schema.ts:9`):

```ts
// The UQF import handler must map UqfCard to createCard's data shape:
for (const card of uqfCards) {
  await createCard(db, {
    type: card.type,  // "open" | "multi_radio" | "multi_select" — direct mapping
    front: card.front,
    back: card.back,
    explanation: card.explanation,
    options: card.options,           // null for open, string[] for closed
    correctIndices: card.correctIndices, // null for open, number[] for closed
    tagIds: [],
    bundleIds: bundleId ? [bundleId] : [],
  });
}
```

The import handler must also handle the new **warnings** field from `UqfParseResult`. Display warnings alongside errors in the UI (perhaps as a blue/grey info box instead of the yellow warning box for errors).

**Tests**: No new unit tests for the page (it's a React component). Verified via E2E tests in Phase 6.

**Commit**: `feat(import): replace SQT mode with UQF mode`

### Task 4.2: Update UQF preview to show card type and handle open/multi_select cards

**What**: Update the UQF preview section in the import page to visually distinguish between `open`, `multi_radio`, and `multi_select` card types. Currently the SQT preview only shows a `"multi_radio"` badge. Update to:
1. Show the actual card type as a badge: `"open"`, `"multi_radio"`, or `"multi_select"` (with display-friendly labels like "Open", "Multiple Choice", "Multi-Select").
2. For `open` cards: show the question text and answer text. Don't show options.
3. For `multi_radio` cards: show options with a single correct answer highlighted (green badge with ✓).
4. For `multi_select` cards: show options with all correct answers highlighted (multiple green badges).
5. Show warnings from `parseUqf()` in a separate info element (blue/grey styling).

**Files**: `src/app/(main)/factory/import/page.tsx` (modify)

**Commit**: `feat(import): update UQF preview for open and multi_select cards`

### Task 4.3: Update UQF help text and format examples

**What**: Replace the SQT format help text in the import page with comprehensive UQF format documentation. Show:
1. Legacy SQT format (fully supported)
2. Modern UQF format with `Question:` / `Q:`, `Answer:` / `Answers:`, `Explanation:` / `Exp:`
3. Open question example
4. Multi-answer example with LaTeX
5. `---` separator explanation
6. Note about LLM tolerance (Markdown list markers, bold wrappers)

The help text should be concise — use `<details><summary>` for the extended examples to keep the page clean.

**Files**: `src/app/(main)/factory/import/page.tsx` (modify)

**Commit**: `feat(import): update help text with UQF format documentation`

---

## Phase 5 — Deprecate SQT Parser

### Task 5.1: Remove old SQT parser and tests

**What**: Remove the old SQT parser since it is now fully superseded by the UQF parser (which is a strict superset). This involves:
1. Delete `src/lib/sqt-parser.ts`.
2. Delete `src/lib/__tests__/sqt-parser.test.ts`.
3. Remove any remaining `import { ... } from "@/lib/sqt-parser"` references (the import page was already updated in Phase 4).
4. Verify no other files reference the old parser.

**Files**: `src/lib/sqt-parser.ts` (delete), `src/lib/__tests__/sqt-parser.test.ts` (delete)

**Commit**: `chore: remove legacy SQT parser (superseded by UQF)`

---

## Phase 6 — E2E Test Updates

### Task 6.1: Update existing SQT E2E test for UQF

**What**: Update the existing SQT import E2E test in `e2e/import-export.spec.ts` (line 266, `"SQT import creates multi_radio cards correctly"`) to use the new UQF import mode. Change:
1. Test name: `"UQF import creates multi_radio cards correctly"` (the legacy SQT input must still work via UQF parser)
2. Button click from `"SQT Import"` to `"UQF Import"`
3. File extension from `.sqt` to `.txt`
4. File input selector from `accept*=".txt"` (this stays the same but verify it still matches)
5. Assert the same card data is imported correctly

**Files**: `e2e/import-export.spec.ts` (modify)

**Commit**: `test(e2e): update SQT test to UQF`

### Task 6.2: Add UQF-specific E2E tests

**What**: Add new E2E test scenarios that exercise features unique to UQF.

**Files**: `e2e/import-export.spec.ts` (modify, append tests)

**Tests**:
1. `"UQF import creates open question cards"` — Input with `Q:` and `Answer:` (no options), verify card type is "open" and back contains the answer.
2. `"UQF import creates multi_select cards"` — Input with `Answers: A, C`, verify card type is "multi_select" and both correct options are highlighted.
3. `"UQF import handles multi-line content"` — Input with multi-line question/answer/explanation, verify content preserves newlines.

**Steps** (for each test):
1. Navigate to `/factory/import`
2. Switch to "UQF Import" mode
3. Write a `.txt` file with the appropriate UQF content
4. Upload via file input
5. Verify parsed card preview shows correct type
6. Click Import
7. Navigate to `/study-dome/cards`
8. Verify card data appears correctly

**Commit**: `test(e2e): add UQF open and multi_select E2E tests`

---

## Phase 7 — Documentation

### Task 7.1: Add UQF format documentation to docs/

**What**: Create `docs/uqf-format.md` documenting the UQF parser, its triggers, card type inference, and examples. This serves as both user documentation and developer reference.

**Files**: `docs/uqf-format.md` (new)

**Content**:
- Overview: UQF is a text-based quiz format, superset of SQT
- Reserved triggers table (Question, Option, Answer, Explanation, Separator)
- Card type inference rules
- Format examples (legacy SQT, modern multi-answer, open question, LaTeX/Markdown)
- Implementation notes for LLM output

**Commit**: `docs: add UQF format documentation`

---

## Phase 8 — Final Verification

### Task 8.1: Run full lint, typecheck, and test suite

**What**: Run the complete verification pipeline:
1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm test:coverage` (verify coverage for `src/lib/uqf-parser.ts`)

**Files**: None (verification only)

**Commit**: No commit — this is a verification step only.

### Task 8.2: E2E test pass

**What**: Run the full Playwright E2E suite to verify no regressions:
1. `pnpm test:e2e`

**Files**: None (verification only)

**Commit**: No commit — this is a verification step only.

---

## Execution Checklist

- [x] License question answered — skipped per user request
- [x] Docker/CI question answered — skipped per user request
- [x] Research phase completed — verified against real code (sqt-parser.ts, import page, schema, card service, E2E tests)
- [x] Every library reference traces to verified source — all APIs verified in-source
- [x] Every task has a `**Tests**` subsection (except verification tasks 8.1/8.2 and cleanup task 5.1)
- [x] E2E testing phase exists with concrete scenarios (Phase 6)
- [x] Every task ends with a `**Commit**` line
- [x] README is not modified (stays slim, no changes needed for this feature)
- [x] All new docs are under `docs/`
- [x] `pnpm` is used (not `npx`) — this project uses `pnpm`
- [x] No skills installation needed for this plan