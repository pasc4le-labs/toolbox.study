# Exam Advanced Options

## Overview

Exam settings now include **Advanced Options** for customizing scoring and fine-tuning question selection. These settings persist on the bundle, so they pre-fill the next time you start an exam from the same bundle.

---

## Configuring Exam Settings

Open the exam dialog from any bundle detail page by clicking **Take Exam**.

### Basic Settings (always visible)

- **Exam Title** — A custom name for the exam session.
- **Questions** — Number of questions to include. Use the slider or type directly into the input field.
- **Time Limit** — Maximum time in minutes. `0` means no limit.

### Advanced Options (collapsible)

Click **Advanced Options** to expand:

- **Points per correct answer** — Positive points awarded for each correct answer. Default: `1`.
- **Negative points per wrong answer** — Penalty for each incorrect answer. Use `0` for no penalty, or negative values (e.g. `-0.25`, `-1`) to penalize wrong answers.
- **Focus on weak cards** — Controls how many of the weakest (lowest stability) cards to prioritise. `0%` = fully random, `100%` = only the weakest cards.

---

## Scoring Formula

The exam score is computed as:

```
totalEarned = correctCount × pointsPerCorrect + wrongCount × pointsPerWrong
maxPossible = totalQuestions × pointsPerCorrect
score = max(0, totalEarned / maxPossible)    // normalized to 0–1
```

**Examples:**

| Points/Correct | Points/Wrong | Correct | Wrong | Score |
|----------------|-------------|---------|-------|-------|
| 1              | 0           | 8       | 2     | 80%   |
| 1              | -0.25       | 8       | 2     | 75%   |
| 2              | -1          | 7       | 3     | 55%   |

---

## Persistence

When you start an exam, the current settings are automatically saved to the bundle. The next time you open the exam dialog from the same bundle, those values pre-fill automatically.

### Editing Defaults on the Bundle Edit Page

1. Navigate to the bundle edit page (`/study-dome/bundles/{id}/edit`).
2. Scroll to **Default Exam Settings**.
3. Adjust the default values for questions, time limit, points, and difficulty.
4. Click **Save**.

These defaults are used when opening the exam dialog for the first time or after resetting.

---

## Results Page

When an exam uses non-default scoring (`pointsPerCorrect != 1` or `pointsPerWrong != 0`), the results page shows:

- **Point breakdown**: `earned / maxPossible points`
- **Points earned & penalty** in separate stat cards
- **Per-question point badges** indicating how many points each answer earned

The normalized percentage score is always displayed for consistency.
