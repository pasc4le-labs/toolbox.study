/**
 * SQT (Simple Question Text) Parser
 *
 * Parses text files with the format:
 *
 * Esercizio N.
 * Question text
 * A) Option A
 * B) Option B
 * C) Option C
 * D) Option D     (optional, varies)
 * Risposta: X
 * Commento: Explanation text   (optional)
 *
 * Returns an array of multi_radio cards ready for import.
 */

export interface SqtCard {
  type: "multi_radio";
  front: string;
  back: string;
  explanation: string | null;
  options: string[];
  correctIndices: number[];
  tags: string[];
}

export interface SqtParseResult {
  cards: SqtCard[];
  errors: string[];
}

export function parseSqt(text: string): SqtParseResult {
  const cards: SqtCard[] = [];
  const errors: string[] = [];

  // Normalize line endings
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // State machine: find "Esercizio" blocks
  let i = 0;
  let exerciseNum = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for the start of an exercise
    if (/^Esercizio\s+\d+\s*\./i.test(line)) {
      exerciseNum++;
      const questionLines: string[] = [];
      const options: string[] = [];
      let correctAnswer: string | null = null;
      let comment: string | null = null;

      // Skip the "Esercizio N." line, collect question lines and options
      i++;

      while (i < lines.length) {
        const currentLine = lines[i].trim();

        // Check for answer line
        if (/^Risposta:\s*/i.test(currentLine)) {
          correctAnswer = currentLine.replace(/^Risposta:\s*/i, "").trim();
          i++;
          // Check for comment on next line(s)
          if (i < lines.length) {
            const nextLine = lines[i].trim();
            if (/^Commento:\s*/i.test(nextLine)) {
              comment = nextLine.replace(/^Commento:\s*/i, "").trim();
              i++;
            }
          }
          break;
        }

        // Check for option line: A) B) C) D) etc.
        const optionMatch = currentLine.match(/^([A-Z])\)\s*(.*)/);
        if (optionMatch) {
          options.push(optionMatch[2].trim());
          i++;
          continue;
        }

        // Check for next exercise — means this one has no Risposta
        if (/^Esercizio\s+\d+\s*\./i.test(currentLine)) {
          break;
        }

        // Otherwise it's a question line
        questionLines.push(currentLine);
        i++;
      }

      const questionText = questionLines.join(" ").trim();

      if (!questionText) {
        errors.push(`Exercise ${exerciseNum}: empty question`);
        continue;
      }

      if (options.length === 0) {
        errors.push(`Exercise ${exerciseNum}: no options found, skipping`);
        continue;
      }

      // Find correct answer index
      let correctIndex = -1;
      if (correctAnswer) {
        // correctAnswer is like "A", "B", "C", "D" or possibly "A" with extra text
        const letter = correctAnswer.charAt(0).toUpperCase();
        const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
        if (idx >= 0 && idx < options.length) {
          correctIndex = idx;
        } else {
          errors.push(`Exercise ${exerciseNum}: correct answer "${correctAnswer}" out of range`);
        }
      } else {
        errors.push(`Exercise ${exerciseNum}: no Risposta found`);
      }

      // The "back" for a multi_radio card is the text of the correct option
      const back = correctIndex >= 0 ? options[correctIndex] : questionText;

      cards.push({
        type: "multi_radio",
        front: questionText,
        back,
        explanation: comment,
        options,
        correctIndices: correctIndex >= 0 ? [correctIndex] : [],
        tags: [],
      });
    } else {
      i++;
    }
  }

  return { cards, errors };
}