import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

async function createCard(
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

test("search filters cards by matching text on the front", async ({ page }) => {
  await createCard(page, "What is photosynthesis?", "A1");
  await createCard(page, "Capital of France?", "Paris");
  await createCard(page, "Photosynthesis light reactions", "B");
  await createCard(page, "Unrelated question", "X");

  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  // All four cards visible
  await expect(page.getByText("What is photosynthesis?")).toBeVisible();
  await expect(page.getByText("Capital of France?")).toBeVisible();
  await expect(page.getByText("Photosynthesis light reactions")).toBeVisible();
  await expect(page.getByText("Unrelated question")).toBeVisible();

  // Search for "photosynthesis"
  const searchInput = page.locator("input[placeholder='Search cards...']");
  await searchInput.fill("photosynthesis");
  await page.waitForTimeout(500);

  // Only the two matching cards visible
  await expect(page.getByText("What is photosynthesis?")).toBeVisible();
  await expect(page.getByText("Photosynthesis light reactions")).toBeVisible();
  await expect(page.getByText("Capital of France?")).not.toBeVisible();
  await expect(page.getByText("Unrelated question")).not.toBeVisible();
});

test("searching for a non-matching term shows an empty result state", async ({ page }) => {
  await createCard(page, "First question", "A");
  await createCard(page, "Second question", "B");

  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  const searchInput = page.locator("input[placeholder='Search cards...']");
  await searchInput.fill("zzzzz-no-match");
  await page.waitForTimeout(500);

  // Both original cards should not be visible
  await expect(page.getByText("First question")).not.toBeVisible();
  await expect(page.getByText("Second question")).not.toBeVisible();

  // Empty state should be shown
  await expect(page.getByText(/No cards match|No cards found/i).first()).toBeVisible();
});

test("clearing the search shows all cards again", async ({ page }) => {
  await createCard(page, "Card one", "1");
  await createCard(page, "Card two", "2");
  await createCard(page, "Card three", "3");

  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  const searchInput = page.locator("input[placeholder='Search cards...']");

  // Filter to one card
  await searchInput.fill("two");
  await page.waitForTimeout(500);
  await expect(page.getByText("Card two")).toBeVisible();
  await expect(page.getByText("Card one")).not.toBeVisible();
  await expect(page.getByText("Card three")).not.toBeVisible();

  // Clear search
  await searchInput.fill("");
  await page.waitForTimeout(500);

  // All three should be back
  await expect(page.getByText("Card one")).toBeVisible();
  await expect(page.getByText("Card two")).toBeVisible();
  await expect(page.getByText("Card three")).toBeVisible();
});

test("search is case-insensitive", async ({ page }) => {
  await createCard(page, "Mitochondria function", "Powerhouse");

  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  const searchInput = page.locator("input[placeholder='Search cards...']");
  // Lowercase query should match uppercase letters in the card
  await searchInput.fill("MITO");
  await page.waitForTimeout(500);

  await expect(page.getByText("Mitochondria function")).toBeVisible();
});
