import { describe, it, expect } from "vitest";
import { parseSqt, type SqtCard, type SqtParseResult } from "@/lib/sqt-parser";

describe("parseSqt", () => {
  it("parses a single exercise with all fields", () => {
    const text = `Esercizio 1.
What is the capital of France?
A) Paris
B) London
C) Rome
Risposta: A
Commento: France is in Europe`;

    const result = parseSqt(text);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toEqual<SqtCard>({
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

    const result = parseSqt(text);
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

    const expected = parseSqt(textLF);
    expect(parseSqt(textCRLF).cards).toEqual(expected.cards);
    expect(parseSqt(textCR).cards).toEqual(expected.cards);
  });

  it("parses exercise with 4 options (D)", () => {
    const text = `Esercizio 1.
Pick one.
A) A
B) B
C) C
D) D
Risposta: C`;

    const result = parseSqt(text);
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

    const result = parseSqt(text);
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toContain("Exercise 1: empty question");
  });

  it("reports error when no options are found", () => {
    const text = `Esercizio 1.
A question with no options.
Risposta: A`;

    const result = parseSqt(text);
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toContain(
      "Exercise 1: no options found, skipping",
    );
  });

  it("reports error when Risposta letter is out of range", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: Z`;

    const result = parseSqt(text);
    expect(result.errors.some((e) => e.includes("out of range"))).toBe(true);
    // still emits a card, but with empty correctIndices
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.correctIndices).toEqual([]);
  });

  it("reports error when Risposta line is missing", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B`;

    const result = parseSqt(text);
    expect(result.errors).toContain("Exercise 1: no Risposta found");
  });

  it("handles exercise without Commento (explanation is null)", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseSqt(text);
    expect(result.cards[0]?.explanation).toBeNull();
  });

  it("matches Esercizio case-insensitively", () => {
    const text = `ESERCIZIO 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseSqt(text);
    expect(result.cards).toHaveLength(1);
  });

  it("trims extra whitespace in option text", () => {
    const text = `Esercizio 1.
Q?
A)    spaced out
B)   B
Risposta: A`;

    const result = parseSqt(text);
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

      const result = parseSqt(text);
      expect(result.cards[0]?.correctIndices).toEqual([expected]);
    }
  });

  it("uses option text (not the letter) for the back field", () => {
    const text = `Esercizio 1.
Q?
A) The capital of France
B) The capital of Italy
Risposta: B`;

    const result = parseSqt(text);
    expect(result.cards[0]?.back).toBe("The capital of Italy");
  });

  it("returns empty tags array on every card", () => {
    const text = `Esercizio 1.
Q?
A) A
B) B
Risposta: A`;

    const result = parseSqt(text);
    expect(result.cards[0]?.tags).toEqual([]);
  });

  it("joins multi-line question text with a space", () => {
    const text = `Esercizio 1.
First line of question.
Second line of question.
A) A
B) B
Risposta: A`;

    const result = parseSqt(text);
    expect(result.cards[0]?.front).toBe(
      "First line of question. Second line of question.",
    );
  });

  it("returns empty result for empty input", () => {
    const result = parseSqt("");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns empty result for input without any exercises", () => {
    const result = parseSqt("just some random text\nno exercises here");
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
