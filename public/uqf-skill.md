# UQF Skill — Generate Flashcards in Universal Quiz Format

You are generating flashcards in **UQF (Universal Quiz Format)**. Output only the format itself — no prose, no code fences, no commentary. The output is parsed verbatim, so a single stray code fence will break the import.

## Triggers (case-insensitive)

| Block        | Triggers                                  | Notes |
|--------------|-------------------------------------------|-------|
| **Question** | `Esercizio N.`, `Question:`, `Q:`         | Text after the trigger is the first line of the question. |
| **Option**   | `[Letter])` or `[Letter].` (A–Z)          | One option per line. **You may wrap in `**...**` for emphasis.** |
| **Answer**   | `Risposta:`, `Answer:`, `Answers:`        | Closed: comma-separated letter(s) — `A`, `A, C`, `A , C`. Open: the full text. |
| **Explanation** | `Commento:`, `Explanation:`, `Exp:`   | Optional. Free-form text, multi-line OK. |
| **Separator** | `---` (three or more dashes, alone)       | Use between cards. Always emit one before the next `Q:`. |

## Card Type Rules

Pick the form that matches the question:

1. **Single answer, multiple choices** → use options + `Answer: A` (one letter).
2. **Multiple correct answers** → use options + `Answers: A, C` (comma-separated letters).
3. **Free-form / essay question** → no options, write the answer text directly after `Answer:`.

The parser infers the type automatically — you don't declare it.

## Hard Rules

- **One question trigger per card.** Never nest or combine two `Q:` lines in one card.
- **Letters in `Answer:` must correspond to options in the same card.** If you write `Answer: C` but only listed A and B, the answer is dropped (the card is still saved but with no correct option).
- **Always use `---` between cards.** Don't rely on blank lines alone.
- **No code fences (` ``` `) in the output.** Fences break the parser. Code samples are fine inline as `` `code` `` but never as fenced blocks.
- **No JSON or YAML.** Output only plain UQF text.
- **Multi-line text is preserved verbatim** — use real newlines, not `\n` escape sequences.
- **Wrap math in `$...$` (inline) or `$$...$$` (display).** Markdown emphasis with `**bold**` and `*italic*` is preserved.

## Worked Examples

### Single-answer multiple choice (becomes `multi_radio`)

```
Q: What is the capital of France?
A) Paris
B) London
C) Rome
Answer: A
Explanation: France is a country in Western Europe.
```

### Multi-select (becomes `multi_select`)

```
Q: Which of the following are prime numbers?
A) 2
B) 4
C) 5
D) 9
Answers: A, C
```

### Open question (becomes `open`)

```
Q: Explain the difference between TCP and UDP in one paragraph.

Answer:
TCP is connection-oriented and guarantees ordered, reliable delivery of bytes.
UDP is connectionless and offers no such guarantees, trading reliability for lower latency.

Explanation: Use TCP for HTTP, SSH, email. Use UDP for video streaming, DNS, VoIP.
```

### Multi-line question with LaTeX

```
Q: A train leaves station A at 60 km/h and another leaves station B at 40 km/h.
The stations are 300 km apart. At what time do they meet if they leave at 09:00?

A) 10:30
B) 11:00
C) 12:00
D) 12:30

Answer: C

Explanation: Combined speed is $100 \text{ km/h}$. Time = $\frac{300}{100} = 3$ hours, so 09:00 + 3h = 12:00.
```

### Multiple cards separated by `---`

```
Q: First question here.
A) opt1
B) opt2
Answer: A
---
Q: Second question here.
A) opt1
B) opt2
Answer: B
---
Q: Third question here.
A) opt1
B) opt2
Answer: A
Exp: Quick note about why A is correct.
```

## Output Checklist

Before you finish, verify:

- [ ] Every card starts with a single question trigger (`Q:`, `Question:`, or `Esercizio N.`).
- [ ] Every answer letter refers to an option that exists in the same card.
- [ ] Multi-answer questions use `Answers: A, C` (plural) or `Answer: A, C` (singular is also accepted).
- [ ] Free-form questions have **no** `A)`/`B)` options between `Q:` and `Answer:`.
- [ ] Cards are separated by `---` on its own line.
- [ ] No prose, no code fences, no commentary — only the format itself.
