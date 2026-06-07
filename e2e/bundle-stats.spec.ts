import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("bundle stats page shows charts and weak cards", async ({ page }) => {
  // 1. Create 3 multi_radio cards
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

    await page.locator("input[type='radio']").nth(0).check();

    await page.click("button:has-text('Create Card')");
    await page.waitForURL(/\/study-dome\/cards/);
  }

  // 2. Create bundle
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", "Stats Test Bundle");
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");
  const bundleUrl = page.url();
  const bundleId = bundleUrl.match(/\/study-dome\/bundles\/(\d+)/)?.[1];
  expect(bundleId).toBeTruthy();

  // 3. Add all cards to bundle
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(800);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const cardDivs = dialog.locator("div.cursor-pointer");
  const cardCount = await cardDivs.count();
  for (let i = 0; i < cardCount; i++) {
    await cardDivs.nth(i).click();
  }

  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (
    (await addBtn.isVisible().catch(() => false)) &&
    !(await addBtn.isDisabled())
  ) {
    await addBtn.click();
  }
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForLoadState("networkidle");

  // 4. Start exam
  await page.click("button:has-text('Take Exam')");
  await page.waitForTimeout(500);

  const examDialog = page.getByRole("dialog");
  await expect(examDialog).toBeVisible({ timeout: 5000 });
  await examDialog.getByRole("button", { name: "Start Exam" }).click();
  await page.waitForURL(/\/study-dome\/exams\/\d+/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // 5. Answer questions: correct, incorrect, correct
  // Q1: select first option (correct)
  await page.getByRole("radio", { name: "Option A" }).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Q2: select second option (incorrect - first option is correct)
  await page.getByRole("radio", { name: "Option B" }).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Next')").click();
  await page.waitForTimeout(300);

  // Q3: select first option (correct)
  await page.getByRole("radio", { name: "Option A" }).click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('Submit Exam')").click();
  await page.waitForURL(/\/study-dome\/exams\/\d+\/results/);
  await page.waitForLoadState("networkidle");

  // 6. Navigate to stats page
  await page.goto(`/study-dome/bundles/${bundleId}/stats`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // 7. Assertions
  await expect(page.getByText("Statistics").first()).toBeVisible();

  // Total attempts = 1
  await expect(page.getByText("1").first()).toBeVisible();

  // Average score should be ~67% (2/3 correct)
  await expect(page.getByText("67%").first()).toBeVisible();

  // Score Trend section heading visible
  await expect(page.getByText("Score Trend")).toBeVisible();

  // Weak Cards section heading visible
  await expect(page.getByText("Weak Cards").first()).toBeVisible();

  // SVG charts should be rendered by Unovis (scope to <main> so the navbar's
  // <Logo> SVG isn't matched first).
  await expect(page.locator("main svg").first()).toBeVisible({ timeout: 5000 });

  // Weak cards section should show the incorrectly answered card
  await expect(page.getByText("Question 2")).toBeVisible();
});
