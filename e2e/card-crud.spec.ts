import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

test("create, view, edit, and delete a knowledge card", async ({ page }) => {
  // Navigate to cards page
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  // Should show empty state
  await expect(page.getByText("No cards yet")).toBeVisible();

  // Click New Card
  await page.click("a:has-text('New Card')");
  await page.waitForURL("/study-dome/cards/new");

  // Select knowledge type (click the label)
  await page.click("label[for='type-knowledge']");

  // Fill form
  await page.fill("#front", "What is the capital of France?");
  await page.fill("#back", "Paris");
  await page.fill("#explanation", "France is a country in Europe.");

  // Submit
  await page.click("button:has-text('Create Card')");

  // Wait for redirect
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");

  // Should see the card in the list
  await expect(page.getByText("What is the capital of France?")).toBeVisible();

  // Click on the card to view details
  await page.click("text=What is the capital of France?");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);

  // Verify details
  await expect(page.getByText("Paris")).toBeVisible();
  await expect(page.getByText("France is a country in Europe.")).toBeVisible();

  // Click Edit
  await page.click("a:has-text('Edit')");
  await page.waitForURL(/\/study-dome\/cards\/\d+\/edit/);
  await page.waitForLoadState("networkidle");

  // Modify fields
  await page.fill("#front", "");
  await page.fill("#front", "What is the capital of Italy?");
  await page.fill("#back", "");
  await page.fill("#back", "Rome");

  // Save
  await page.click("button:has-text('Update Card')");
  await page.waitForURL(/\/study-dome\/cards/);

  // Verify edit in list
  await expect(page.getByText("What is the capital of Italy?")).toBeVisible();

  // View the edited card
  await page.click("text=What is the capital of Italy?");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);

  // Delete the card - click the Delete button on the page
  await page.click("button:has-text('Delete'):not(:has-text('Cancel'))");
  
  // Wait for dialog to appear
  await expect(page.getByText("Are you sure you want to delete this card?")).toBeVisible();
  
  // Click the destructive Delete button inside the dialog
  await page.click("[role='dialog'] button:has-text('Delete')");

  // Should be back on cards page with empty state
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("No cards yet")).toBeVisible();
});

test("create a multi_radio card with options", async ({ page }) => {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  // Select multi_radio type
  await page.click("label[for='type-multi-radio']");

  // Add more options (first one exists, add 2 more)
  await page.click("button:has-text('Add Option')");
  await page.click("button:has-text('Add Option')");

  // Fill front and back
  await page.fill("#front", "What is 2+2?");
  await page.fill("#back", "4");

  // Fill options (there should be 3 option inputs now)
  const optionInputs = page.locator("input[placeholder^='Option']");
  await expect(optionInputs).toHaveCount(3);
  await optionInputs.nth(0).fill("3");
  await optionInputs.nth(1).fill("4");
  await optionInputs.nth(2).fill("5");

  // Select correct answer (Option 2 = index 1)
  await page.locator("input[type='radio']").nth(1).check();

  // Submit
  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);

  // Verify card appears
  await expect(page.getByText("What is 2+2?")).toBeVisible();
});
