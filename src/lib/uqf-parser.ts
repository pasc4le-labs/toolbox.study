/**
 * UQF (Universal Quiz Format) Parser
 *
 * A strict superset of the legacy SQT format. Supports:
 * - Legacy SQT triggers: `Esercizio N.`, `Risposta:`, `Commento:`
 * - Modern UQF triggers: `Question:` / `Q:`, `Answer:` / `Answers:`, `Explanation:` / `Exp:`
 * - Open questions (no options between Question and Answer)
 * - Multi-correct answers (`Answers: A, C` → `multi_select`)
 * - Multi-line text, LaTeX, and Markdown preserved
 * - `---` separator to terminate a card
 * - LLM-tolerant option parsing (`- A)`, `* B)`, `**A.**`, etc.)
 */

export type UqfCardType = "open" | "multi_radio" | "multi_select";

export interface UqfOption {
  letter: string;
  text: string;
}

export interface UqfCard {
  type: UqfCardType;
  front: string;
  back: string;
  explanation: string | null;
  options: string[] | null;
  correctIndices: number[] | null;
  tags: string[];
}

export interface UqfParseResult {
  cards: UqfCard[];
  errors: string[];
  warnings: string[];
}

type ParserState = "IDLE" | "QUESTION" | "OPTION" | "ANSWER" | "EXPLANATION";

interface InProgressCard {
  questionLines: string[];
  options: UqfOption[];
  answerLetters: string[] | null;
  answerTextLines: string[];
  explanationLines: string[];
  closedAnswerSeen: boolean;
}

const QUESTION_RE = /^(?:Esercizio\s+\d+\.|Question:|Q:)\s*(.*)/i;
const OPTION_RE = /^(?:[-*]\s*)?(?:\*\*)?([A-Z])[)\.](?:\*\*)?\s*(.*)/;
const ANSWER_RE = /^(?:Risposta:|Answers?:)\s*(.*)/i;
const EXPLANATION_RE = /^(?:Commento:|Explanation:|Exp:)\s*(.*)/i;
const SEPARATOR_RE = /^---+\s*$/;

export function parseUqf(text: string): UqfParseResult {
  const cards: UqfCard[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");

  let state: ParserState = "IDLE";
  let current: InProgressCard | null = null;
  let currentAnswerLine: string | null = null;

  const finalize = () => {
    if (!current) return;
    const card = buildCard(current, errors);
    if (card) cards.push(card);
    current = null;
  };

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx] ?? "";
    const rightTrimmed = raw.replace(/\s+$/, "");

    if (QUESTION_RE.test(rightTrimmed)) {
      finalize();
      const match = rightTrimmed.match(QUESTION_RE);
      const captured = match?.[1] ?? "";
      state = "QUESTION";
      current = {
        questionLines: [],
        options: [],
        answerLetters: null,
        answerTextLines: [],
        explanationLines: [],
        closedAnswerSeen: false,
      };
      currentAnswerLine = null;
      if (captured.length > 0) current.questionLines.push(captured);
      continue;
    }

    if (SEPARATOR_RE.test(rightTrimmed)) {
      finalize();
      state = "IDLE";
      continue;
    }

    if (!current) {
      // Lines outside any card are ignored
      continue;
    }

    // Check answer trigger (must be checked before option since answers don't start with letters)
    if (ANSWER_RE.test(rightTrimmed)) {
      const match = rightTrimmed.match(ANSWER_RE);
      const captured = match?.[1] ?? "";
      state = "ANSWER";
      currentAnswerLine = captured;
      if (current.options.length === 0) {
        // Open question path: collect all text after trigger
        if (captured.length > 0) current.answerTextLines.push(captured);
      } else {
        // Closed question path: capture letter(s) for later parsing
        current.answerLetters = [captured];
        current.closedAnswerSeen = true;
      }
      continue;
    }

    if (EXPLANATION_RE.test(rightTrimmed)) {
      const match = rightTrimmed.match(EXPLANATION_RE);
      const captured = match?.[1] ?? "";
      state = "EXPLANATION";
      if (captured.length > 0) current.explanationLines.push(captured);
      continue;
    }

    // Option matching is only valid before an answer is seen
    if (
      state === "QUESTION" ||
      state === "OPTION"
    ) {
      const optMatch = rightTrimmed.match(OPTION_RE);
      if (optMatch) {
        state = "OPTION";
        const letter = optMatch[1] ?? "";
        const text = (optMatch[2] ?? "").trim();
        current.options.push({ letter, text });
        continue;
      }
    }

    // Continuation line for the current state's buffer
    if (state === "QUESTION") {
      if (rightTrimmed.length > 0) current.questionLines.push(rightTrimmed);
      continue;
    }

    if (state === "OPTION") {
      // Stray line after options, before answer — treat as more question text
      if (rightTrimmed.length > 0) current.questionLines.push(rightTrimmed);
      state = "QUESTION";
      continue;
    }

    if (state === "ANSWER") {
      if (current.options.length === 0) {
        // Open: append to answer text
        if (rightTrimmed.length > 0) {
          current.answerTextLines.push(rightTrimmed);
        } else if (current.answerTextLines.length > 0) {
          // Preserve blank lines between non-blank answer lines
          current.answerTextLines.push("");
        }
      } else if (current.closedAnswerSeen) {
        // Closed: after the answer line was processed, any trailing lines
        // are treated as explanation continuation.
        if (rightTrimmed.length > 0) {
          current.explanationLines.push(rightTrimmed);
        } else if (current.explanationLines.length > 0) {
          current.explanationLines.push("");
        }
        state = "EXPLANATION";
      } else {
        // Closed: append to answer letters buffer (handles wrapped multi-line `A,\n C`)
        if (rightTrimmed.length > 0 && current.answerLetters) {
          current.answerLetters.push(rightTrimmed);
        }
      }
      continue;
    }

    if (state === "EXPLANATION") {
      if (rightTrimmed.length > 0) {
        current.explanationLines.push(rightTrimmed);
      } else if (current.explanationLines.length > 0) {
        current.explanationLines.push("");
      }
      continue;
    }

    // IDLE — ignore
  }

  // Flush the last card
  finalize();
  state = "IDLE";

  if (cards.length === 0 && currentAnswerLine === null && text.trim().length > 0) {
    // no triggers detected — not an error, just nothing to import
  }

  return { cards, errors, warnings };
}

function buildCard(
  draft: InProgressCard,
  errors: string[],
): UqfCard | null {
  const front = draft.questionLines.join("\n").replace(/^\n+|\n+$/g, "");

  if (!front) {
    errors.push("Empty question text, skipping card");
    return null;
  }

  // Open question path: no options detected
  if (draft.options.length === 0) {
    const back = draft.answerTextLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (!back) {
      errors.push(`Open question "${truncate(front)}" has no Answer block`);
    }
    const explanation = joinExplanation(draft.explanationLines);
    return {
      type: "open",
      front,
      back,
      explanation,
      options: null,
      correctIndices: null,
      tags: [],
    };
  }

  // Closed question path
  const optionTexts = draft.options.map((o) => o.text);

  // Map option letter → its position in the options array, so we can resolve
  // answers even when options appear in non-alphabetical order (e.g. C, A, B).
  const letterToIndex = new Map<string, number>();
  draft.options.forEach((opt, i) => {
    letterToIndex.set(opt.letter, i);
  });

  const rawLetters = (draft.answerLetters ?? []).join(" ");
  const letterList = rawLetters
    .split(/[,\n]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);

  const indices: number[] = [];
  for (const letter of letterList) {
    const idx = letterToIndex.get(letter);
    if (idx === undefined) {
      errors.push(`Answer letter "${letter}" out of range`);
    } else if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }

  if (letterList.length === 0) {
    errors.push(`Question "${truncate(front)}" has no Answer block`);
  }

  const type: UqfCardType = indices.length > 1 ? "multi_select" : "multi_radio";
  const back =
    indices.length > 0
      ? indices.map((i) => optionTexts[i] ?? "").join(", ")
      : front;

  const explanation = joinExplanation(draft.explanationLines);

  return {
    type,
    front,
    back,
    explanation,
    options: optionTexts,
    correctIndices: indices,
    tags: [],
  };
}

function joinExplanation(lines: string[]): string | null {
  const text = lines.join("\n").replace(/^\n+|\n+$/g, "");
  return text.length > 0 ? text : null;
}

function truncate(s: string, max = 40): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
