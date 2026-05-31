import { test, expect } from "@playwright/test";
import { clearIndexedDB, waitForDb } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

/**
 * Helper: create a knowledge card via the UI
 */
async function createCard(page: import("@playwright/test").Page, front: string, back: string) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  await page.click("label[for='type-knowledge']");
  await page.fill("#front", front);
  await page.fill("#back", back);
  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
}

/**
 * Helper: create a bundle via the UI
 */
async function createBundle(
  page: import("@playwright/test").Page,
  title: string,
  description?: string,
) {
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");

  await page.fill("#title", title);
  if (description) {
    await page.fill("#desc", description);
  }
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");
}

/**
 * Helper: add all cards to a bundle via the "Add Cards" dialog
 */
async function addAllCardsToBundle(page: import("@playwright/test").Page, count: number) {
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(500);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Select all cards in the dialog
  const cardItems = dialog.locator("div.cursor-pointer");
  const itemCount = await cardItems.count();
  for (let i = 0; i < itemCount; i++) {
    await cardItems.nth(i).click();
  }

  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if ((await addBtn.isVisible().catch(() => false)) && !(await addBtn.isDisabled())) {
    await addBtn.click();
  }
  await page.waitForTimeout(500);
}

test.describe("Exchange Center", () => {
  test("overview page renders with CTAs", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await expect(page.getByRole("heading", { name: "Exchange Center" })).toBeVisible();
    await expect(page.getByText("Offer Items")).toBeVisible();
    await expect(page.getByText("Receive Items")).toBeVisible();
  });

  test("can navigate to offer page", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await page.getByText("Offer Items").click();
    await expect(page).toHaveURL(/\/exchange-center\/offer$/);
    await expect(page.getByRole("button", { name: "Create Room" })).toBeVisible();
  });

  test("can navigate to receive page", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await page.getByText("Receive Items").click();
    await expect(page).toHaveURL(/\/exchange-center\/receive$/);
    await expect(page.getByPlaceholder("e.g. A3XK")).toBeVisible();
  });

  test("offer page shows disabled button when no items selected", async ({ page }) => {
    await page.goto("/exchange-center/offer");
    await waitForDb(page);

    await expect(page.getByRole("button", { name: "Create Room" })).toBeDisabled();
  });

  test("receive page accepts room code input", async ({ page }) => {
    await page.goto("/exchange-center/receive");
    await waitForDb(page);

    const input = page.getByPlaceholder("e.g. A3XK");
    await input.fill("ABCD");
    await expect(input).toHaveValue("ABCD");
    await expect(page.getByRole("button", { name: "Connect" })).toBeEnabled();
  });

  test("selecting a bundle does not auto-select cards or exams with same numeric ID", async ({
    page,
  }) => {
    // Create items so that card, bundle, and exam all get overlapping IDs (id=1)
    await createCard(page, "Test Card Front", "Test Card Back");
    await createBundle(page, "Test Bundle");

    // Navigate to offer page
    await page.goto("/exchange-center/offer");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Switch to Bundles tab
    await page.getByRole("tab", { name: /Bundles/ }).click();
    await page.waitForTimeout(300);

    // Select the bundle (first item in the list)
    const bundleCheckbox = page.locator("label").filter({ hasText: "Test Bundle" }).locator('[role="checkbox"]');
    await bundleCheckbox.click();

    // Verify selection count shows 1
    await expect(page.getByText("1 item(s) selected")).toBeVisible();

    // Switch to Cards tab — card should NOT be checked
    await page.getByRole("tab", { name: /Cards/ }).click();
    await page.waitForTimeout(200);

    const cardCheckbox = page.locator("label").filter({ hasText: "Test Card Front" }).locator('[role="checkbox"]');
    // Card should NOT be checked (this was the bug: selecting bundle id=1 also selected card id=1)
    await expect(cardCheckbox).not.toBeChecked();

    // Switch to Exams tab (none should exist)
    await page.getByRole("tab", { name: /Exams/ }).click();
    await page.waitForTimeout(200);
    await expect(page.getByText("0 exam(s)")).toBeVisible();

    // Go back to Bundles tab - the bundle should still be checked
    await page.getByRole("tab", { name: /Bundles/ }).click();
    await page.waitForTimeout(200);
    await expect(bundleCheckbox).toBeChecked();
  });

  test("selecting a card does not auto-select bundle or exam with same numeric ID", async ({
    page,
  }) => {
    // Create items so that card, bundle, and exam all get overlapping IDs (id=1)
    await createCard(page, "Another Card", "Back side");
    await createBundle(page, "Another Bundle");

    await page.goto("/exchange-center/offer");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Cards tab is default — select the card
    const cardCheckbox = page.locator("label").filter({ hasText: "Another Card" }).locator('[role="checkbox"]');
    await cardCheckbox.click();

    await expect(page.getByText("1 item(s) selected")).toBeVisible();

    // Switch to Bundles tab — bundle should NOT be checked
    await page.getByRole("tab", { name: /Bundles/ }).click();
    await page.waitForTimeout(200);

    const bundleCheckbox = page.locator("label").filter({ hasText: "Another Bundle" }).locator('[role="checkbox"]');
    await expect(bundleCheckbox).not.toBeChecked();

    // Switch back to Cards — card should still be checked
    await page.getByRole("tab", { name: /Cards/ }).click();
    await page.waitForTimeout(200);
    await expect(cardCheckbox).toBeChecked();
  });

  test("select all in one category does not affect other categories", async ({ page }) => {
    // Create 2 cards and 1 bundle
    await createCard(page, "Card Alpha", "Alpha back");
    await createCard(page, "Card Beta", "Beta back");
    await createBundle(page, "Bundle Gamma");

    await page.goto("/exchange-center/offer");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Click "Select All" on Cards tab
    await page.getByText("Select All").click();
    await expect(page.getByText("2 item(s) selected")).toBeVisible();

    // Switch to Bundles tab — no bundles should be checked
    await page.getByRole("tab", { name: /Bundles/ }).click();
    await page.waitForTimeout(200);

    const bundleCheckbox = page.locator("label").filter({ hasText: "Bundle Gamma" }).locator('[role="checkbox"]');
    await expect(bundleCheckbox).not.toBeChecked();

    // Select the bundle
    await bundleCheckbox.click();
    await expect(page.getByText("3 item(s) selected")).toBeVisible();

    // Switch back to Cards — both cards should still be selected
    await page.getByRole("tab", { name: /Cards/ }).click();
    await page.waitForTimeout(200);
    await expect(
      page.locator("label").filter({ hasText: "Card Alpha" }).locator('[role="checkbox"]'),
    ).toBeChecked();
    await expect(
      page.locator("label").filter({ hasText: "Card Beta" }).locator('[role="checkbox"]'),
    ).toBeChecked();
  });

  test("export and import round-trip preserves bundle with cards", async ({ page }) => {
    // This test verifies the serialization/import path used by exchange center
    // through the Factory export/import feature (which uses the same importExchangeData logic)
    
    // 1. Create a card and a bundle
    await createCard(page, "Exchange Test Card", "The Answer");
    
    // 2. Create bundle
    await createBundle(page, "Exchange Test Bundle");
    const bundleUrl = page.url();
    const bundleMatch = bundleUrl.match(/\/study-dome\/bundles\/(\d+)/);
    expect(bundleMatch).toBeTruthy();
    const bundleId = bundleMatch![1];

    // 3. Add card to bundle
    await addAllCardsToBundle(page, 1);
    
    // Verify card is in the bundle
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Exchange Test Card")).toBeVisible();

    // 4. Export via factory
    await page.goto("/factory/export");
    await page.waitForLoadState("networkidle");

    // Make sure "Bundles" scope is selected
    await page.getByRole("button", { name: /Bundles/ }).click();
    await page.waitForLoadState("networkidle");

    await page.getByText("Select All").click();
    await page.waitForTimeout(200);

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const downloadPath = `/tmp/stb-exchange-test-${Date.now()}.json`;
    await download.saveAs(downloadPath);

    // 5. Read and verify export
    const fs = await import("fs");
    const exportData = JSON.parse(await fs.promises.readFile(downloadPath, "utf-8"));
    
    expect(exportData.bundles).toBeDefined();
    expect(exportData.bundles.length).toBe(1);
    expect(exportData.bundles[0].title).toBe("Exchange Test Bundle");
    // The critical check: bundles must include their cards
    expect(exportData.bundles[0].cards.length).toBeGreaterThan(0);
    expect(exportData.bundles[0].cards[0].front).toBe("Exchange Test Card");

    // 6. Clear DB and re-import
    await clearIndexedDB(page);

    await page.goto("/factory/import");
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
    await fileInput.setInputFiles(downloadPath);

    // Wait for preview to show
    await expect(page.getByRole("heading", { name: /Bundles \(\d+\)/ })).toBeVisible();

    // Click import
    await page.getByRole("button", { name: /Import \d+ Cards/ }).click();
    await expect(page.getByRole("heading", { name: /Bundles \(\d+\)/ })).not.toBeVisible();

    // 7. Verify imported bundle has cards
    await page.goto("/study-dome/bundles");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Exchange Test Bundle")).toBeVisible();
    await page.click("text=Exchange Test Bundle");
    await page.waitForURL(/\/study-dome\/bundles\/\d+/);
    await page.waitForLoadState("networkidle");

    // The bundle should contain the card
    await expect(page.getByText("Exchange Test Card")).toBeVisible();

    // Cleanup
    await fs.promises.unlink(downloadPath);
  });
});