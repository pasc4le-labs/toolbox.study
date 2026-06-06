import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

async function createKnowledgeCard(
  page: import("@playwright/test").Page,
  front: string,
  back: string,
) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");
  await page.click("label[for='type-knowledge']");
  await page.fill("#front", front);
  await page.fill("#back", back);
  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
}

async function createBundleAndGetId(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/study-dome/bundles/new");
  await page.waitForLoadState("networkidle");
  await page.fill("#title", title);
  await page.click("button:has-text('Create Bundle')");
  await page.waitForURL(/\/study-dome\/bundles\/\d+/);
  await page.waitForLoadState("networkidle");
  return parseInt(page.url().split("/").pop()!);
}

test("creating a bundle lets you add cards via the Add Cards dialog", async ({ page }) => {
  await createKnowledgeCard(page, "C1", "A1");
  await createKnowledgeCard(page, "C2", "A2");
  const bundleId = await createBundleAndGetId(page, "B1");

  await page.goto(`/study-dome/bundles/${bundleId}`);
  await page.waitForLoadState("networkidle");

  // Empty state visible
  await expect(page.getByText("No cards in this bundle yet.")).toBeVisible();

  // Open Add Cards dialog
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(500);

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // Click the first two card tiles
  const tiles = dialog.locator("div.cursor-pointer");
  await tiles.nth(0).click();
  await page.waitForTimeout(150);
  await tiles.nth(1).click();
  await page.waitForTimeout(150);

  // Confirm
  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  // Cards should now be in the bundle
  await expect(page.getByText("C1").first()).toBeVisible();
  await expect(page.getByText("C2").first()).toBeVisible();
});

test("removing a card from a bundle works via the row's remove button", async ({ page }) => {
  await createKnowledgeCard(page, "Keep", "K");
  await createKnowledgeCard(page, "Remove", "R");
  const bundleId = await createBundleAndGetId(page, "B");

  await page.goto(`/study-dome/bundles/${bundleId}`);
  await page.waitForLoadState("networkidle");

  // Add both cards
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(500);

  const dialog = page.locator('[role="dialog"]');
  const tiles = dialog.locator("div.cursor-pointer");
  await tiles.nth(0).click();
  await page.waitForTimeout(150);
  await tiles.nth(1).click();
  await page.waitForTimeout(150);
  const addBtn = dialog.getByRole("button", { name: /^Add/ });
  if (await addBtn.isVisible().catch(() => false) && !(await addBtn.isDisabled())) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  // Both cards present
  await expect(page.getByText("Keep").first()).toBeVisible();
  await expect(page.getByText("Remove").first()).toBeVisible();

  // Click the remove button (trash icon) on the Remove card row
  // The row is a Card containing a button with the trash icon
  const removeRow = page.locator(".space-y-2 > div", { hasText: "Remove" });
  const removeBtn = removeRow.locator("button").last();
  await removeBtn.click();
  await page.waitForTimeout(500);

  // "Remove" should be gone
  await expect(page.locator("h1, h2, h3, a, span, p").filter({ hasText: /^Remove$/ }).first()).not.toBeVisible();
  await expect(page.getByText("Keep").first()).toBeVisible();
});

test("a card can be in multiple bundles", async ({ page }) => {
  await createKnowledgeCard(page, "SharedCard", "X");

  // Bundle 1
  const b1Id = await createBundleAndGetId(page, "Bundle1");
  await page.goto(`/study-dome/bundles/${b1Id}`);
  await page.waitForLoadState("networkidle");
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(500);
  const d1 = page.locator('[role="dialog"]');
  await d1.locator("div.cursor-pointer").first().click();
  await page.waitForTimeout(150);
  const a1 = d1.getByRole("button", { name: /^Add/ });
  if (await a1.isVisible().catch(() => false) && !(await a1.isDisabled())) {
    await a1.click();
    await page.waitForTimeout(500);
  }

  // Bundle 2
  const b2Id = await createBundleAndGetId(page, "Bundle2");
  await page.goto(`/study-dome/bundles/${b2Id}`);
  await page.waitForLoadState("networkidle");
  await page.click("button:has-text('Add Cards')");
  await page.waitForTimeout(500);
  const d2 = page.locator('[role="dialog"]');
  await d2.locator("div.cursor-pointer").first().click();
  await page.waitForTimeout(150);
  const a2 = d2.getByRole("button", { name: /^Add/ });
  if (await a2.isVisible().catch(() => false) && !(await a2.isDisabled())) {
    await a2.click();
    await page.waitForTimeout(500);
  }

  // Both bundles should now show SharedCard
  await expect(page.getByText("SharedCard").first()).toBeVisible();
  await page.goto(`/study-dome/bundles/${b1Id}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("SharedCard").first()).toBeVisible();
});

test("editing a bundle's title persists", async ({ page }) => {
  const bundleId = await createBundleAndGetId(page, "OldTitle");

  await page.goto(`/study-dome/bundles/${bundleId}/edit`);
  await page.waitForLoadState("networkidle");

  // Update title
  const titleInput = page.locator("#title");
  await titleInput.fill("");
  await titleInput.fill("NewTitle");
  await page.click("button:has-text('Save')");
  await page.waitForLoadState("networkidle");

  // Navigate back to the bundle
  await page.goto(`/study-dome/bundles/${bundleId}`);
  await page.waitForLoadState("networkidle");

  // New title should be shown
  await expect(page.getByRole("heading", { name: "NewTitle" })).toBeVisible();
});

test("deleting a bundle removes it from the bundles list", async ({ page }) => {
  await createBundleAndGetId(page, "ToDelete");

  // Go to bundles list page
  await page.goto("/study-dome/bundles");
  await page.waitForLoadState("networkidle");

  // Verify bundle is present
  await expect(page.locator("text=ToDelete").first()).toBeVisible();

  // Click Delete on the ToDelete card
  const card = page.locator(".grid > div", { hasText: "ToDelete" });
  await card.locator("button:has-text('Delete')").click();
  await page.waitForTimeout(400);

  // Confirm dialog
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.locator("button:has-text('Delete')").click();
  await page.waitForTimeout(800);

  // ToDelete should be gone
  await expect(page.locator("text=ToDelete").first()).not.toBeVisible();
});
