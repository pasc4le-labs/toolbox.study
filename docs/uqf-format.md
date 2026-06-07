# UQF — Universal Quiz Format

> A plain-text, human-readable format for authoring flashcards. UQF is a strict superset of the legacy SQT format and is the canonical text-import format for StudyToolbox.

## Overview

UQF is parsed by `src/lib/uqf-parser.ts`. The parser outputs ready-to-import `UqfCard` objects that map directly onto the database card types:

- `multi_radio` — single correct answer (radio button)
- `multi_select` — one or more correct answers (checkboxes)
- `open` — free-form text answer (no options)

## Triggers

All triggers are **case-insensitive**. Whitespace around the trigger and the value is flexible.

| Block        | Triggers                                  | Captures |
|--------------|-------------------------------------------|----------|
| **Question** | `Esercizio N.`, `Question:`, `Q:`         | Everything after the trigger (text after the colon / period is the first line of the question) |
| **Option**   | `[Letter])` or `[Letter].`                | Letter + text. LLM-tolerant prefixes: `- `, `* `, `**` wrappers. Example: `A)`, `B.`, `- A)`, `*B)`, `**A.**` |
| **Answer**   | `Risposta:`, `Answer:`, `Answers:`        | Closed: comma-separated letter(s) (e.g. `A, C`). Open: full text after the trigger |
| **Explanation** | `Commento:`, `Explanation:`, `Exp:`   | Optional. Multi-line, preserved verbatim |
| **Separator** | `---` (three or more dashes, alone)       | Saves the current card and starts a fresh one |

## Card Type Inference

The parser decides the card type based on the content between `Question:` and `Answer:`:

| Detection                                  | Card type      |
|--------------------------------------------|----------------|
| One or more `A)`-style options, single letter in `Answer:` | `multi_radio`  |
| One or more options, **multiple** letters in `Answer:` (e.g. `A, C`) | `multi_select` |
| No options between `Question:` and `Answer:` (text flows straight through) | `open` |

## Examples

### Legacy SQT (multi_radio)

```
Esercizio 1.
What is the capital of France?
A) Paris
B) London
C) Rome
Risposta: A
Commento: France is in Europe.
```

### Modern UQF (multi_radio)

```
Question: What is the capital of France?
A) Paris
B) London
C) Rome
Answer: A
Explanation: France is in Europe.
```

### Multi-select (multi_select)

```
Q: Which of the following are prime numbers?
A) 2
B) 4
C) 5
D) 9
Answers: A, C
```

### Open question (no options)

```
Q: Explain the difference between TCP and UDP.

Answer:
TCP is connection-oriented and guarantees ordered delivery.
UDP is connectionless and offers no delivery guarantees.

Exp: Trade-off is reliability vs. latency.
```

### LaTeX and Markdown preserved verbatim

```
Question: Derive the **quadratic formula** step by step.

Answer:
The quadratic formula is:

$$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$

This applies to equations of the form $ax^2 + bx + c = 0$.

Explanation: Derived by *completing the square*:

```
(x + b/2a)^2 = (b^2 - 4ac) / 4a^2
```
```

### LLM-tolerant option formatting

All of these parse to the same options `[alpha, beta]`:

```
- A) alpha
- B) beta
```

```
* A) alpha
* B) beta
```

```
**A)** alpha
**B)** beta
```

```
**A.** alpha
**B.** beta
```

### Multiple cards separated by `---`

```
Q: First question?
A) yes
B) no
Answer: A
---
Q: Second question?
A) yes
B) no
Answer: B
```

## Behavioral Notes

- **Line endings**: `\r\n`, `\r`, and `\n` are all normalized to `\n` before parsing.
- **Multi-line content**: Question, answer (open), and explanation blocks preserve newlines verbatim. Use `whitespace-pre-wrap` in the UI to render correctly.
- **Mixed-case triggers**: `QUESTION:`, `q:`, `ANSWER:`, `Exp:` all work.
- **Out-of-range letters**: If `Answer: Z` is given for a question with only A–B options, the parser emits a warning and ignores the out-of-range letter (the in-range letters, if any, are still used).
- **Empty question**: A card with only whitespace before the first option is skipped with an error.
- **Non-alphabetical option order**: `C) third`, `A) first`, `B) second` is fully supported — the answer letter is matched to the option by its captured letter, not by position.
- **Trailing content after Answer**: For closed questions, any non-trigger lines after the `Answer:` line are treated as the explanation (handy when copy-pasting from sources that don't have an `Explanation:` block).

## Implementation Reference

- Parser: `src/lib/uqf-parser.ts`
- Unit tests: `src/lib/__tests__/uqf-parser.test.ts`
- Import UI: `src/app/(main)/factory/import/page.tsx` (UQF tab)
- E2E tests: `e2e/import-export.spec.ts`

## Generating UQF from an LLM

UQF is designed to be **easy for an LLM to emit**. Use this prompt template:

> You are a tutor. Generate a list of flashcard questions about `<TOPIC>` in UQF format. Use one card per block. Use `---` to separate cards. Use `Answers: A, C` for multi-select. Use the open-question form (no `A)` options) for free-form questions. Use LaTeX (`$...$`, `$$...$$`) for math and Markdown for emphasis.
