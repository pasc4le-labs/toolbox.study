import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

async function createKnowledgeCard(
  page: import("@playwright/test").Page,
  front: string,
  back: string,
  tagNames: string[] = [],
) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");
  await page.click("label[for='type-knowledge']");

  await page.fill("#front", front);
  await page.fill("#back", back);

  // Add tags (creates via getOrCreateTag)
  for (const name of tagNames) {
    await page.fill("input[placeholder='New tag name...']", name);
    await page.click("button:has-text('Add')");
    await page.waitForTimeout(150);
  }

  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
}

test("Tags page shows empty state when no tags exist", async ({ page }) => {
  await page.goto("/study-dome/tags");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByText("No tags yet. Add tags to your cards to see stats here."),
  ).toBeVisible();
});

test("creating cards with tags populates the Tags page", async ({ page }) => {
  await createKnowledgeCard(page, "What is DNA?", "Deoxyribonucleic acid", [
    "biology",
  ]);
  await createKnowledgeCard(page, "What is RNA?", "Ribonucleic acid", [
    "biology",
  ]);

  await page.goto("/study-dome/tags");
  await page.waitForLoadState("networkidle");

  // "biology" tag should appear with card count = 2
  await expect(page.getByText("biology").first()).toBeVisible();
  await expect(page.getByText("2").first()).toBeVisible(); // cardCount badge
});

test("a card with multiple tags shows all of them on the Tags page", async ({ page }) => {
  await createKnowledgeCard(
    page,
    "Cell organelle question?",
    "Mitochondrion",
    ["biology", "cells"],
  );

  await page.goto("/study-dome/tags");
  await page.waitForLoadState("networkidle");

  // Both tags should be present
  const tagCards = page.locator(".cursor-pointer");
  await expect(tagCards).toHaveCount(2);
});

test("clicking a tag navigates to its detail page with associated cards", async ({ page }) => {
  await createKnowledgeCard(page, "Q1", "A1", ["history"]);
  await createKnowledgeCard(page, "Q2", "A2", ["history"]);

  await page.goto("/study-dome/tags");
  await page.waitForLoadState("networkidle");

  await page.click("text=history");
  await page.waitForURL(/\/study-dome\/tags\/\d+/);
  await page.waitForLoadState("networkidle");

  // Both cards should be listed on the tag detail page
  await expect(page.getByText("Q1")).toBeVisible();
  await expect(page.getByText("Q2")).toBeVisible();
});

test("filtering cards by tag from card list", async ({ page }) => {
  // Create a card with a specific tag, then create a few without
  await createKnowledgeCard(page, "TaggedCard", "A", ["unique-tag"]);
  await createKnowledgeCard(page, "Untagged1", "B");
  await createKnowledgeCard(page, "Untagged2", "C");

  // From the cards page, click on the badge "unique-tag" on a card
  // (this may not be a clickable filter — instead navigate to tag detail)
  await page.goto("/study-dome/tags");
  await page.waitForLoadState("networkidle");

  await page.click("text=unique-tag");
  await page.waitForURL(/\/study-dome\/tags\/\d+/);
  await page.waitForLoadState("networkidle");

  // Only TaggedCard should be listed
  await expect(page.getByText("TaggedCard")).toBeVisible();
  await expect(page.getByText("Untagged1")).not.toBeVisible();
  await expect(page.getByText("Untagged2")).not.toBeVisible();
});
