import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("create a bundle, create exam, take it, and see results", async ({ page }) => {
  // Create 3 multi_radio cards (knowledge cards are excluded from exams)
  for (let i = 1; i <= 3; i++) {
    await page.goto("/study-dome/cards/new");
    await page.waitForLoadState("networkidle");
    await page.click("label[for='type-multi-radio']");

    // Add 2 options
    await page.click("button:has-text('Add Option')");
    await page.waitForTimeout(100);

    await page.fill("#front", `Question ${i}`);
    await page.fill("#back", `Answer ${i}`);

    // Fill options
    const opts = page.locator("input[placeholder^='Option']");
    await opts.nth(0).fill("Option A");
    await opts.nth(1).fill("Option B");

    // Select correct answer (first option)
    await page.locator("input[type='radio']").nth(0).check();

    // Create card
    await page.click("button:has-text('Create Card')");
    await page.waitForURL(/\/study-dome\/cards/);
  }

  // Create a bundle
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", "Test Bundle");
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");

  // Navigate to bundle and add all cards via the dialog
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(800);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Find all clickable card divs
  const cardDivs = dialog.locator("div.cursor-pointer");
  const cardCount = await cardDivs.count();

  if (cardCount > 0) {
    for (let i = 0; i < cardCount; i++) {
      await cardDivs.nth(i).click();
    }
    await page.waitForTimeout(300);

    const addBtn = dialog.getByRole("button", { name: /^Add/ });
    if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  }

  await page.waitForTimeout(300);

  // Reload to ensure fresh state
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Start exam
  await page.click("button:has-text('Take Exam')");
  await page.waitForTimeout(500);

  const examDialog = page.getByRole("dialog");
  await expect(examDialog).toBeVisible({ timeout: 5000 });

  // Verify Advanced Options collapsible is present
  await expect(examDialog.getByText("Advanced Options")).toBeVisible();

  // Verify input+slider combo for questions
  const questionInput = examDialog.locator('input[type="number"]').first();
  await expect(questionInput).toBeVisible();

  // Start exam with defaults
  await examDialog.getByRole("button", { name: "Start Exam" }).click();

  // Should navigate to exam page
  await page.waitForURL(/\/study-dome\/exams\/\d+/);
  await page.waitForLoadState("networkidle");

  // Wait for radio buttons to render
  await page.waitForSelector("[role='radio']", { timeout: 5000 });

  // Answer questions by clicking radio buttons, then Next
  for (let i = 0; i < 2; i++) {
    // Click the first radio option
    const firstRadio = page.locator("[role='radio']").first();
    await firstRadio.click();
    await page.waitForTimeout(200);

    // Click Next
    await page.locator("button:has-text('Next')").click();
    await page.waitForTimeout(300);
  }

  // Submit exam
  await page.click("button:has-text('Submit Exam')");

  // Should see results page
  await page.waitForURL(/\/study-dome\/exams\/\d+\/results/);
  await page.waitForLoadState("networkidle");

  // Verify results page shows
  await expect(page.getByText("Question Breakdown")).toBeVisible();
  await expect(page.getByText("Back to Study Dome").first()).toBeVisible();

  // Verify all 3 questions appear in results
  await expect(page.getByText("1.", { exact: true })).toBeVisible();
  await expect(page.getByText("2.", { exact: true })).toBeVisible();
  await expect(page.getByText("3.", { exact: true })).toBeVisible();

  // Verify an unanswered question badge exists (question 3 was not answered)
  await expect(page.locator("[data-slot='badge']").filter({ hasText: "Unanswered" })).toBeVisible();

  // Verify answered questions have Correct or Incorrect badges
  const correctBadges = page.locator("[data-slot='badge']").filter({ hasText: /^Correct$/ });
  const incorrectBadges = page.locator("[data-slot='badge']").filter({ hasText: /^Incorrect$/ });
  const totalAnsweredBadges = await correctBadges.count() + await incorrectBadges.count();
  expect(totalAnsweredBadges).toBeGreaterThanOrEqual(1);
});