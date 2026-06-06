import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("Factory page shows empty state when no providers exist", async ({ page }) => {
  await page.goto("/factory");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByText("No AI providers configured. Add a provider to start generating cards."),
  ).toBeVisible();
});

test("adding an AI provider makes it appear in the list", async ({ page }) => {
  await page.goto("/factory");
  await page.waitForLoadState("networkidle");

  // Open the Add Provider dialog
  await page.click("button:has-text('Add Provider')");
  await page.waitForTimeout(300);

  // Fill the form (baseUrl is empty by default; OpenAI-compatible requires it)
  await page.fill("#name", "My OpenAI");
  await page.fill("#baseUrl", "https://api.openai.com/v1");
  await page.fill("#modelId", "gpt-4o-mini");

  // Save
  await page.click("[role='dialog'] button:has-text('Add')");
  await page.waitForTimeout(800);

  // Provider card should now be visible
  await expect(page.getByText("My OpenAI").first()).toBeVisible();
  await expect(page.getByText("gpt-4o-mini").first()).toBeVisible();
});

test("editing an AI provider updates its name and model", async ({ page }) => {
  // Add first
  await page.goto("/factory");
  await page.waitForLoadState("networkidle");

  await page.click("button:has-text('Add Provider')");
  await page.waitForTimeout(300);
  await page.fill("#name", "Original");
  await page.fill("#baseUrl", "https://api.openai.com/v1");
  await page.fill("#modelId", "old-model");
  await page.click("[role='dialog'] button:has-text('Add')");
  await page.waitForTimeout(800);

  // Edit
  await page.click("button:has-text('Edit')");
  await page.waitForTimeout(300);

  await page.fill("#name", "");
  await page.fill("#name", "Renamed");
  await page.fill("#modelId", "");
  await page.fill("#modelId", "new-model");

  await page.click("[role='dialog'] button:has-text('Update')");
  await page.waitForTimeout(800);

  // Updated values should be visible
  await expect(page.getByText("Renamed").first()).toBeVisible();
  await expect(page.getByText("new-model").first()).toBeVisible();
  await expect(page.locator("text=Original").first()).not.toBeVisible();
});

test("setting a provider as default marks only one as default", async ({ page }) => {
  await page.goto("/factory");
  await page.waitForLoadState("networkidle");

  // Add first provider as default
  await page.click("button:has-text('Add Provider')");
  await page.waitForTimeout(300);
  await page.fill("#name", "A");
  await page.fill("#baseUrl", "https://api.openai.com/v1");
  await page.fill("#modelId", "model-a");
  await page.check("#isDefault");
  await page.click("[role='dialog'] button:has-text('Add')");
  await page.waitForTimeout(800);

  // Add second provider as default
  await page.click("button:has-text('Add Provider')");
  await page.waitForTimeout(300);
  await page.fill("#name", "B");
  await page.fill("#baseUrl", "https://api.openai.com/v1");
  await page.fill("#modelId", "model-b");
  await page.check("#isDefault");
  await page.click("[role='dialog'] button:has-text('Add')");
  await page.waitForTimeout(800);

  // Only "B" should have the Default badge
  const defaultBadges = page.locator("text=Default");
  await expect(defaultBadges).toHaveCount(1);
});

test("deleting a provider removes it from the list", async ({ page }) => {
  // Add a provider
  await page.goto("/factory");
  await page.waitForLoadState("networkidle");

  await page.click("button:has-text('Add Provider')");
  await page.waitForTimeout(300);
  await page.fill("#name", "ToDelete");
  await page.fill("#baseUrl", "https://api.openai.com/v1");
  await page.fill("#modelId", "x");
  await page.click("[role='dialog'] button:has-text('Add')");
  await page.waitForTimeout(800);

  await expect(page.getByText("ToDelete").first()).toBeVisible();

  // Auto-accept the confirm dialog
  page.on("dialog", (dialog) => dialog.accept());

  // Click Delete
  await page.click("button:has-text('Delete')");
  await page.waitForTimeout(800);

  // Provider should be gone
  await expect(page.locator("text=ToDelete").first()).not.toBeVisible();
  // Back to empty state
  await expect(
    page.getByText("No AI providers configured. Add a provider to start generating cards."),
  ).toBeVisible();
});
