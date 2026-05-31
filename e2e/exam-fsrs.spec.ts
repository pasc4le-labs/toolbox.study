import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("exam answers update FSRS state correctly", async ({ page }) => {
  // ── Create 3 multi_radio cards ──
  for (let i = 1; i <= 3; i++) {
    await page.goto("/study-dome/cards/new");
    await page.waitForLoadState("networkidle");
    await page.click("label[for='type-multi-radio']");

    await page.click("button:has-text('Add Option')");
    await page.waitForTimeout(100);

    await page.fill("#front", `Question ${i}`);
    await page.fill("#back", `Answer ${i}`);

    const opts = page.locator("input[placeholder^='Option']");
    await opts.nth(0).fill("Option A");
    await opts.nth(1).fill("Option B");

    // Mark first option as correct
    await page.locator("input[type='radio']").nth(0).check();

    await page.click("button:has-text('Create Card')");
    await page.waitForURL(/\/study-dome\/cards/);
  }

  // ── Create a bundle ──
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", "FSRS Test Bundle");
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");

  const bundleUrl = page.url();
  const bundleId = bundleUrl.match(/\/bundles\/(\d+)/)?.[1];
  expect(bundleId).toBeTruthy();

  // ── Add all cards to bundle ──
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(800);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const cardDivs = dialog.locator("div.cursor-pointer");
  const cardCount = await cardDivs.count();
  expect(cardCount).toBeGreaterThanOrEqual(3);

  for (let i = 0; i < cardCount; i++) {
    await cardDivs.nth(i).click();
  }
  await page.waitForTimeout(300);

  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForLoadState("networkidle");

  // ── Start exam ──
  await page.click("button:has-text('Take Exam')");
  await page.waitForTimeout(500);

  const examDialog = page.getByRole("dialog");
  await expect(examDialog).toBeVisible({ timeout: 5000 });
  await examDialog.getByRole("button", { name: "Start Exam" }).click();

  await page.waitForURL(/\/study-dome\/exams\/\d+/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Extract attemptId from URL
  const examUrl = page.url();
  const attemptId = examUrl.match(/\/exams\/(\d+)/)?.[1];
  expect(attemptId).toBeTruthy();

  // ── Answer questions: first correctly, second WRONGLY, third correctly ──
  // Card 1: answer correctly (select first option)
  const label1 = page.locator("label[id^='q-opt-']").first();
  if (await label1.isVisible().catch(() => false)) {
    await label1.click();
    await page.waitForTimeout(200);
  }
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Card 2: answer incorrectly (select second option → wrong)
  const labels = page.locator("label[id^='q-opt-']");
  if ((await labels.count()) >= 2) {
    await labels.nth(1).click();
    await page.waitForTimeout(200);
  }
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Card 3: answer correctly (select first option)
  const label3 = page.locator("label[id^='q-opt-']").first();
  if (await label3.isVisible().catch(() => false)) {
    await label3.click();
    await page.waitForTimeout(200);
  }

  // ── Submit exam ──
  await page.click("button:has-text('Submit Exam')");
  await page.waitForURL(/\/study-dome\/exams\/\d+\/results/);
  await page.waitForLoadState("networkidle");

  // ── Verify results page shows correct breakdown ──
  await expect(page.getByText("Question Breakdown")).toBeVisible();

  // ── Verify FSRS state via DB query ──
  const data = await page.evaluate(async (aid) => {
    const getter = (window as unknown as {
      __getAttemptResults: (id: number) => Promise<{
        answers: Array<{ cardId: number; isCorrect: boolean | null }>;
        fsrsStates: Array<{
          cardId: number; state: number; due: number;
          stability: number; difficulty: number; reps: number; lapses: number;
        }>;
      }>;
    }).__getAttemptResults;
    return getter(parseInt(aid));
  }, attemptId);

  // All 3 cards should have FSRS state (reps === 1 means rateCard was called)
  expect(data.fsrsStates).toHaveLength(3);
  for (const fs of data.fsrsStates) {
    expect(fs.reps).toBe(1);
  }

  // Separate correct/wrong card IDs
  const wrongCardIds = data.answers
    .filter((a) => a.isCorrect === false)
    .map((a) => a.cardId);
  const correctCardIds = data.answers
    .filter((a) => a.isCorrect === true)
    .map((a) => a.cardId);

  expect(wrongCardIds).toHaveLength(1);
  expect(correctCardIds).toHaveLength(2);

  // Verify FSRS state differences between correct/wrong answers
  for (const fs of data.fsrsStates) {
    if (wrongCardIds.includes(fs.cardId)) {
      // Again on a new card → low stability, Learning or New state
      expect(fs.stability).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(fs.state);
    } else {
      // Good on a new card → stability > 0
      expect(fs.stability).toBeGreaterThan(0);
      expect([1, 2]).toContain(fs.state);
    }
  }

  // ── Verify review page loads with bundle filter ──
  await page.goto(`/study-dome/review?bundleId=${bundleId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Page should have rendered (either showing cards or "no cards" message)
  const noCards = page.locator("text=No Cards Due!");
  const cardProgress = page.locator("text=Card");
  const eitherVisible = (await noCards.isVisible().catch(() => false)) ||
    (await cardProgress.first().isVisible().catch(() => false));
  expect(eitherVisible).toBe(true);
});

test("all correct answers complete successfully", async ({ page }) => {
  // ── Create 2 multi_radio cards ──
  for (let i = 1; i <= 2; i++) {
    await page.goto("/study-dome/cards/new");
    await page.waitForLoadState("networkidle");
    await page.click("label[for='type-multi-radio']");

    await page.click("button:has-text('Add Option')");
    await page.waitForTimeout(100);

    await page.fill("#front", `AllCorrect Q${i}`);
    await page.fill("#back", `Answer ${i}`);

    const opts = page.locator("input[placeholder^='Option']");
    await opts.nth(0).fill("Option A");
    await opts.nth(1).fill("Option B");

    await page.locator("input[type='radio']").nth(0).check();

    await page.click("button:has-text('Create Card')");
    await page.waitForURL(/\/study-dome\/cards/);
  }

  // ── Create bundle and add cards ──
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", "All Correct Bundle");
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");

  const bundleUrl = page.url();
  const attemptId2 = bundleUrl.match(/\/bundles\/(\d+)/)?.[1];

  // Add cards
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(800);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const cardDivs = dialog.locator("div.cursor-pointer");
  const cardCount = await cardDivs.count();
  for (let i = 0; i < cardCount; i++) {
    await cardDivs.nth(i).click();
  }
  await page.waitForTimeout(300);

  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  await page.reload();
  await page.waitForLoadState("networkidle");

  // ── Start exam and answer all correctly ──
  await page.click("button:has-text('Take Exam')");
  await page.waitForTimeout(500);

  const examDialog2 = page.getByRole("dialog");
  await expect(examDialog2).toBeVisible({ timeout: 5000 });
  await examDialog2.getByRole("button", { name: "Start Exam" }).click();

  await page.waitForURL(/\/study-dome\/exams\/\d+/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  const examUrl2 = page.url();
  const attemptId = examUrl2.match(/\/exams\/(\d+)/)?.[1];
  expect(attemptId).toBeTruthy();

  // Answer both correctly
  for (let i = 0; i < 2; i++) {
    const label = page.locator("label[id^='q-opt-']").first();
    if (await label.isVisible().catch(() => false)) {
      await label.click();
      await page.waitForTimeout(200);
    }
    if (i === 0) {
      await page.locator("button:has-text('Next')").click();
      await page.waitForTimeout(300);
    }
  }

  await page.click("button:has-text('Submit Exam')");
  await page.waitForURL(/\/study-dome\/exams\/\d+\/results/);
  await page.waitForLoadState("networkidle");

  // Verify all correct on results page
  await expect(page.getByText("Question Breakdown")).toBeVisible();
  const correctLabels = await page.locator("text=Correct").count();
  expect(correctLabels).toBeGreaterThanOrEqual(2);

  // Verify FSRS: all cards have reps === 1 and stability > 0
  const data = await page.evaluate(async (aid) => {
    const getter = (window as unknown as {
      __getAttemptResults: (id: number) => Promise<{
        answers: Array<{ cardId: number; isCorrect: boolean | null }>;
        fsrsStates: Array<{
          cardId: number; reps: number; stability: number; state: number;
        }>;
      }>;
    }).__getAttemptResults;
    return getter(parseInt(aid));
  }, attemptId);

  expect(data.fsrsStates.length).toBeGreaterThanOrEqual(2);
  for (const fs of data.fsrsStates) {
    expect(fs.reps).toBe(1);
    expect(fs.stability).toBeGreaterThan(0);
  }

  // All answers should be correct
  for (const a of data.answers) {
    expect(a.isCorrect).toBe(true);
  }
});
