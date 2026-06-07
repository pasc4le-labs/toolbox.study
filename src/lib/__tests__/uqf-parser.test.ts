import { describe, it, expect } from "vitest";
import { parseUqf, type UqfCard } from "@/lib/uqf-parser";

// ─────────────────────────────────────────────────────────────────────────────
// SQT backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — SQT backward compatibility", () => {
  it("parses a single exercise with all fields", () => {
    const text = `Esercizio 1.
What is the capital of France?
A) Paris
B) London
C) Rome
Risposta: A
Commento: France is in Europe`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toEqual<UqfCard>({
      type: "multi_radio",
      front: "What is the capital of France?",
      back: "Paris",
      explanation: "France is in Europe",
      options: ["Paris", "London", "Rome"],
      correctIndices: [0],
      tags: [],
    });
  });

  it("parses multiple exercises in one text", () => {
    const text = `Esercizio 1.
Q1?
A) A1
B) B1
Risposta: A

Esercizio 2.
Q2?
A) A2
B) B2
Risposta: B`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]?.front).toBe("Q1?");
    expect(result.cards[1]?.front).toBe("Q2?");
    expect(result.cards[1]?.correctIndices).toEqual([1]);
  });

  it("normalizes \\r\\n and \\r line endings", () => {
    const textCRLF = "Esercizio 1.\r\nQ?\r\nA) A\r\nB) B\r\nRisposta: A\r\n";
    const textCR = "Esercizio 1.\rQ?\rA) A\rB) B\rRisposta: A\r";
    const textLF = "Esercizio 1.\nQ?\nA) A\nB) B\nRisposta: A\n";

    const expected = parseUqf(textLF);
    expect(parseUqf(textCRLF).cards).toEqual(expected.cards);
    expect(parseUqf(textCR).cards).toEqual(expected.cards);
  });

  it("parses exercise with 4 options (D)", () => {
    const text = `Esercizio 1.
Pick one.
A) A
B) B
C) C
D) D
Risposta: C`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards[0]?.options).toEqual(["A", "B", "C", "D"]);
    expect(result.cards[0]?.correctIndices).toEqual([2]);
    expect(result.cards[0]?.back).toBe("C");
  });

  it("reports error for empty question text", () => {
    const text = `Esercizio 1.

A) opt
B) opt
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Empty question/);
  });

  it("treats no-options input as an open question (behavior change from SQT)", () => {
    const text = `Esercizio 1.
A question with no options.
Risposta: A`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe("open");
    expect(result.cards[0]?.front).toBe("A question with no options.");
    expect(result.cards[0]?.back).toBe("A");
    expect(result.cards[0]?.options).toBeNull();
    expect(result.cards[0]?.correctIndices).toBeNull();
  });

  it("reports error when answer letter is out of range", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: Z`;

    const result = parseUqf(text);
    expect(result.errors.some((e) => e.includes("out of range"))).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.correctIndices).toEqual([]);
  });

  it("reports error when answer line is missing", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.errors.some((e) => /no Answer/.test(e))).toBe(true);
  });

  it("handles exercise without Commento (explanation is null)", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.explanation).toBeNull();
  });

  it("matches Esercizio case-insensitively", () => {
    const text = `ESERCIZIO 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
  });

  it("trims extra whitespace in option text", () => {
    const text = `Esercizio 1.
Q?
A)    spaced out
B)   B
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["spaced out", "B"]);
  });

  it("maps Risposta letters to correctIndices 0=A, 1=B, 2=C, 3=D", () => {
    for (const [letter, expected] of [
      ["A", 0],
      ["B", 1],
      ["C", 2],
      ["D", 3],
    ] as const) {
      const text = `Esercizio 1.
Q?
A) A
B) B
C) C
D) D
Risposta: ${letter}`;

      const result = parseUqf(text);
      expect(result.cards[0]?.correctIndices).toEqual([expected]);
    }
  });

  it("uses option text (not the letter) for the back field", () => {
    const text = `Esercizio 1.
Q?
A) The capital of France
B) The capital of Italy
Risposta: B`;

    const result = parseUqf(text);
    expect(result.cards[0]?.back).toBe("The capital of Italy");
  });

  it("returns empty tags array on every card", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.tags).toEqual([]);
  });

  it("preserves multi-line question text with newlines (behavior change from SQT)", () => {
    const text = `Esercizio 1.
First line of question.
Second line of question.
A) A
B) B
Risposta: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.front).toBe(
      "First line of question.\nSecond line of question.",
    );
  });

  it("returns empty result for empty input", () => {
    const result = parseUqf("");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns empty result for input without any exercises", () => {
    const result = parseUqf("just some random text\nno exercises here");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New UQF format triggers
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — new format triggers", () => {
  it("parses Question: trigger", () => {
    const text = `Question: What is the capital of France?
A) Paris
B) London
Answer: A`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toBe("What is the capital of France?");
    expect(result.cards[0]?.type).toBe("multi_radio");
    expect(result.cards[0]?.correctIndices).toEqual([0]);
  });

  it("parses Q: trigger", () => {
    const text = `Q: What is 2+2?
A) 4
B) 5
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toBe("What is 2+2?");
    expect(result.cards[0]?.correctIndices).toEqual([0]);
  });

  it("parses Answer: trigger", () => {
    const text = `Q: Pick A.
A) alpha
B) beta
Answer: B`;

    const result = parseUqf(text);
    expect(result.cards[0]?.back).toBe("beta");
    expect(result.cards[0]?.correctIndices).toEqual([1]);
  });

  it("parses Answers: trigger (comma-separated letters)", () => {
    const text = `Q: Pick all primes.
A) 2
B) 4
C) 5
D) 9
Answers: A, C`;

    const result = parseUqf(text);
    expect(result.cards[0]?.type).toBe("multi_select");
    expect(result.cards[0]?.correctIndices).toEqual([0, 2]);
    expect(result.cards[0]?.back).toBe("2, 5");
  });

  it("parses Explanation: trigger", () => {
    const text = `Q: Q?
A) A
B) B
Answer: A
Explanation: Some reason`;

    const result = parseUqf(text);
    expect(result.cards[0]?.explanation).toBe("Some reason");
  });

  it("parses Exp: trigger shorthand", () => {
    const text = `Q: Q?
A) A
B) B
Answer: A
Exp: Reason`;

    const result = parseUqf(text);
    expect(result.cards[0]?.explanation).toBe("Reason");
  });

  it("case-insensitive triggers", () => {
    const text = `QUESTION: Q?
A) A
B) B
answer: A
EXPLANATION: because`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.explanation).toBe("because");
  });

  it("Q: followed by multi-line question text", () => {
    const text = `Q: First line
Second line
Third line
A) opt
B) opt2
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.front).toBe("First line\nSecond line\nThird line");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Open questions
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — open questions", () => {
  it("parses open question with Answer: block", () => {
    const text = `Q:
Explain TCP.

Answer:
TCP is connection-oriented.`;

    const result = parseUqf(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe("open");
    expect(result.cards[0]?.front).toBe("Explain TCP.");
    expect(result.cards[0]?.back).toBe("TCP is connection-oriented.");
    expect(result.cards[0]?.options).toBeNull();
    expect(result.cards[0]?.correctIndices).toBeNull();
  });

  it("parses open question with multi-line answer", () => {
    const text = `Q: Walk me through X.
Answer:
Line one
Line two
Line three`;

    const result = parseUqf(text);
    expect(result.cards[0]?.back).toBe("Line one\nLine two\nLine three");
  });

  it("parses open question with Risposta: (legacy)", () => {
    const text = `Esercizio 1.
Explain X
Risposta: Y`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe("open");
    expect(result.cards[0]?.back).toBe("Y");
  });

  it("parses open question with explanation after answer", () => {
    const text = `Q: A question.
Answer: The answer.
Exp: Why.`;

    const result = parseUqf(text);
    expect(result.cards[0]?.type).toBe("open");
    expect(result.cards[0]?.back).toBe("The answer.");
    expect(result.cards[0]?.explanation).toBe("Why.");
  });

  it("open question with no answer produces error and empty back", () => {
    const text = `Q: What?
---`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe("open");
    expect(result.cards[0]?.back).toBe("");
    expect(result.errors.some((e) => /no Answer/.test(e))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-line content, LaTeX, and Markdown
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — multi-line and LaTeX", () => {
  it("multi-line question text preserves newlines", () => {
    const text = `Q:
First line
Second line
A) Option
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.front).toBe("First line\nSecond line");
  });

  it("LaTeX inline math in question", () => {
    const text = `Q: What is $x^2$?
A) 1
B) $x^2$
Answer: B`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options?.[1]).toBe("$x^2$");
  });

  it("LaTeX display math in answer", () => {
    const text = `Q:
Derive the quadratic formula.

Answer:
The formula is:
$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`;

    const result = parseUqf(text);
    expect(result.cards[0]?.back).toBe(
      "The formula is:\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$",
    );
  });

  it("Markdown bold in options", () => {
    const text = `Q: Which are correct?
**A)** Option A
**B)** Option B
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["Option A", "Option B"]);
  });

  it("Markdown code blocks in explanation", () => {
    const text = `Q: Q?
A) A
B) B
Answer: A
Explanation: Use \`code\` and:
\`\`\`
block
\`\`\``;

    const result = parseUqf(text);
    expect(result.cards[0]?.explanation).toBe(
      "Use `code` and:\n```\nblock\n```",
    );
  });

  it("multi-line answer for open question preserves newlines", () => {
    const text = `Q: Q?
Answer:
Line 1
Line 2
Line 3`;

    const result = parseUqf(text);
    expect(result.cards[0]?.back).toBe("Line 1\nLine 2\nLine 3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-answer (multi_select)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — multi-answer (multi_select)", () => {
  it("parses multi-answer with Answers: A, C", () => {
    const text = `Q: Pick all that apply.
A) optA
B) optB
C) optC
D) optD
Answers: A, C`;

    const result = parseUqf(text);
    expect(result.cards[0]?.type).toBe("multi_select");
    expect(result.cards[0]?.correctIndices).toEqual([0, 2]);
    expect(result.cards[0]?.back).toBe("optA, optC");
  });

  it("parses multi-answer with Answer: A, B, D (singular trigger)", () => {
    const text = `Q: Pick some.
A) a
B) b
C) c
D) d
Answer: A, B, D`;

    const result = parseUqf(text);
    expect(result.cards[0]?.type).toBe("multi_select");
    expect(result.cards[0]?.correctIndices).toEqual([0, 1, 3]);
  });

  it("single answer still produces multi_radio", () => {
    const text = `Q: Q?
A) A
B) B
Answer: B`;

    const result = parseUqf(text);
    expect(result.cards[0]?.type).toBe("multi_radio");
    expect(result.cards[0]?.correctIndices).toEqual([1]);
  });

  it("multi-answer with whitespace variations", () => {
    const variants = [
      `Q: Q?\nA) a\nB) b\nC) c\nD) d\nAnswers: A,C`,
      `Q: Q?\nA) a\nB) b\nC) c\nD) d\nAnswers: A , C`,
      `Q: Q?\nA) a\nB) b\nC) c\nD) d\nAnswers:  A  ,  D  `,
    ];
    const expectedIndices = [
      [0, 2],
      [0, 2],
      [0, 3],
    ];
    for (let i = 0; i < variants.length; i++) {
      const result = parseUqf(variants[i]!);
      expect(result.cards[0]?.correctIndices).toEqual(expectedIndices[i]);
    }
  });

  it("multi-answer out-of-range letters produce errors", () => {
    const text = `Q: Q?
A) a
B) b
C) c
D) d
Answers: A, Z`;

    const result = parseUqf(text);
    expect(result.errors.some((e) => /out of range/.test(e))).toBe(true);
    expect(result.cards[0]?.correctIndices).toEqual([0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Separators and edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — separators and edge cases", () => {
  it("--- separator ends current card", () => {
    const text = `Esercizio 1.
Q1?
A) a
B) b
Risposta: A
---
Esercizio 2.
Q2?
A) c
B) d
Risposta: B`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]?.front).toBe("Q1?");
    expect(result.cards[1]?.front).toBe("Q2?");
  });

  it("--- with extra dashes still works", () => {
    const text = `Q: Q1?
A) a
B) b
Answer: A
----
Q: Q2?
A) c
B) d
Answer: C
-----`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(2);
  });

  it("--- between Q: blocks with blank lines", () => {
    const text = `Q: Q1?
A) a
B) b
Answer: A

---

Q: Q2?
A) c
B) d
Answer: C`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(2);
  });

  it("multiple --- in a row don't create extra cards", () => {
    const text = `Q: Q1?
A) a
B) b
Answer: A
---
---
---`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
  });

  it("empty input returns empty result", () => {
    const result = parseUqf("");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("input without any triggers returns empty result", () => {
    const result = parseUqf("plain text\nno triggers at all");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("trailing content after last answer is treated as explanation", () => {
    const text = `Q: Q?
A) a
B) b
Answer: A
some trailing text
more text`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.explanation).toBe("some trailing text\nmore text");
  });

  it("option letters in non-alphabetical order", () => {
    const text = `Q: Q?
C) third
A) first
B) second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["third", "first", "second"]);
    expect(result.cards[0]?.correctIndices).toEqual([1]);
  });

  it("mixed triggers in same file", () => {
    const text = `Esercizio 1.
Q1?
A) a
B) b
Risposta: A

Q: Q2?
A) c
B) d
Answer: B

Question: Q3?
A) e
B) f
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards).toHaveLength(3);
    expect(result.cards[0]?.front).toBe("Q1?");
    expect(result.cards[1]?.front).toBe("Q2?");
    expect(result.cards[2]?.front).toBe("Q3?");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LLM tolerance
// ─────────────────────────────────────────────────────────────────────────────

describe("parseUqf — LLM tolerance", () => {
  it("option with dash prefix: - A) text", () => {
    const text = `Q: Q?
- A) First
- B) Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option with asterisk prefix: * B) text", () => {
    const text = `Q: Q?
* A) First
* B) Second
Answer: B`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
    expect(result.cards[0]?.correctIndices).toEqual([1]);
  });

  it("option with bold wrapper: **A)** text", () => {
    const text = `Q: Q?
**A)** First
**B)** Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option with bold wrapper and period: **C.** text", () => {
    const text = `Q: Q?
**A.** First
**B.** Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option with period instead of paren: D. text", () => {
    const text = `Q: Q?
A. First
B. Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option with bold and period: **D.** text", () => {
    const text = `Q: Q?
**A.** First
**B.** Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option with leading whitespace and list marker: - **A)** text", () => {
    const text = `Q: Q?
- **A)** First
- **B)** Second
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual(["First", "Second"]);
  });

  it("option text preserves content with bold/LaTeX/code after trigger", () => {
    const text = `Q: Q?
A) The **bold** answer
B) $x^2$ math
C) \`code\` here
Answer: A`;

    const result = parseUqf(text);
    expect(result.cards[0]?.options).toEqual([
      "The **bold** answer",
      "$x^2$ math",
      "`code` here",
    ]);
  });
});
