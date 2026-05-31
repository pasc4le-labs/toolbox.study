import { test, expect } from "@playwright/test";
import { clearIndexedDB } from "./setup";
import fs from "fs";
import path from "path";
import os from "os";

test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});

async function createKnowledgeCard(page: import("@playwright/test").Page) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  await page.click("label[for='type-knowledge']");
  await page.fill("#front", "Capital of France");
  await page.fill("#back", "Paris");
  await page.fill("#explanation", "France is in Europe.");

  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
}

async function createOpenCard(page: import("@playwright/test").Page) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  await page.click("label[for='type-open']");
  await page.fill("#front", "Solve 2+2");
  await page.fill("#back", "4");

  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
}

async function createMultiRadioCard(page: import("@playwright/test").Page) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  await page.click("label[for='type-multi-radio']");
  await page.fill("#front", "What is 2+2?");
  await page.fill("#back", "4");

  // Add two more options (default is 1)
  await page.click("button:has-text('Add Option')");
  await page.click("button:has-text('Add Option')");

  const optionInputs = page.locator("input[placeholder^='Option']");
  await expect(optionInputs).toHaveCount(3);
  await optionInputs.nth(0).fill("3");
  await optionInputs.nth(1).fill("4");
  await optionInputs.nth(2).fill("5");

  // Select correct answer (index 1 = "4")
  await page.locator("input[type='radio']").nth(1).check();

  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
}

async function createMultiSelectCard(page: import("@playwright/test").Page) {
  await page.goto("/study-dome/cards/new");
  await page.waitForLoadState("networkidle");

  await page.click("label[for='type-multi-select']");
  await page.fill("#front", "Select the prime numbers");
  await page.fill("#back", "2, 3");

  // Add two more options
  await page.click("button:has-text('Add Option')");
  await page.click("button:has-text('Add Option')");

  const optionInputs = page.locator("input[placeholder^='Option']");
  await expect(optionInputs).toHaveCount(3);
  await optionInputs.nth(0).fill("2");
  await optionInputs.nth(1).fill("3");
  await optionInputs.nth(2).fill("4");

  // Check correct options (index 0 and 1) using the shadcn Checkbox
  const checkboxes = page.locator("[role='checkbox']");
  await expect(checkboxes).toHaveCount(3);
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();

  await page.click("button:has-text('Create Card')");
  await page.waitForURL(/\/study-dome\/cards/);
  await page.waitForLoadState("networkidle");
}

test("direct JSON import of a knowledge card", async ({ page }) => {
  await page.goto("/factory/import");
  await page.waitForLoadState("networkidle");

  const exportData = {
    cards: [
      {
        type: "knowledge",
        front: "Direct import test",
        back: "It works",
        explanation: null,
        tagNames: [],
      },
    ],
  };

  const tmpFile = path.join(os.tmpdir(), `direct-${Date.now()}.json`);
  await fs.promises.writeFile(tmpFile, JSON.stringify(exportData), "utf-8");

  const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
  await fileInput.setInputFiles(tmpFile);

  await expect(page.getByRole("heading", { name: /Standalone Cards \(\d+\)/ })).toBeVisible();

  // Click the exact Import button (not the "JSON Import" tab)
  await page.getByRole("button", { name: /Import \d+ Cards/ }).click();

  // Wait for preview to disappear
  await expect(page.getByRole("heading", { name: /Standalone Cards \(\d+\)/ })).not.toBeVisible();

  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Direct import test")).toBeVisible();

  await fs.promises.unlink(tmpFile);
});

test("round-trip export and import preserves all card types", async ({ page }) => {
  // ── 1. Create one card of each type ──
  await createKnowledgeCard(page);
  await createOpenCard(page);
  await createMultiRadioCard(page);
  await createMultiSelectCard(page);

  // Verify all 4 cards are visible
  await expect(page.getByText("Capital of France")).toBeVisible();
  await expect(page.getByText("Solve 2+2")).toBeVisible();
  await expect(page.getByText("What is 2+2?")).toBeVisible();
  await expect(page.getByText("Select the prime numbers")).toBeVisible();

  // ── 2. Export all cards ──
  await page.goto("/factory/export");
  await page.waitForLoadState("networkidle");

  // Switch to Individual Cards scope
  await page.click("button:has-text('Individual Cards')");
  await page.waitForLoadState("networkidle");

  // Select all cards
  await page.click("button:has-text('Select All')");

  // Trigger export and capture download
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Export")'),
  ]);

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "stb-export-"));
  const downloadPath = path.join(tmpDir, "export.json");
  await download.saveAs(downloadPath);
  const exportContent = await fs.promises.readFile(downloadPath, "utf-8");
  const exportData = JSON.parse(exportContent);

  expect(exportData).toHaveProperty("cards");
  expect(Array.isArray(exportData.cards)).toBe(true);
  expect(exportData.cards.length).toBe(4);

  // Verify export structure for each type
  const knowledge = exportData.cards.find((c: any) => c.type === "knowledge");
  const open = exportData.cards.find((c: any) => c.type === "open");
  const multiRadio = exportData.cards.find((c: any) => c.type === "multi_radio");
  const multiSelect = exportData.cards.find((c: any) => c.type === "multi_select");

  expect(knowledge).toBeDefined();
  expect(open).toBeDefined();
  expect(multiRadio).toBeDefined();
  expect(multiSelect).toBeDefined();

  // Verify arrays are real arrays, not double-encoded strings
  expect(Array.isArray(multiRadio.options)).toBe(true);
  expect(Array.isArray(multiRadio.correctIndices)).toBe(true);
  expect(multiRadio.options).toEqual(["3", "4", "5"]);
  expect(multiRadio.correctIndices).toEqual([1]);

  expect(Array.isArray(multiSelect.options)).toBe(true);
  expect(Array.isArray(multiSelect.correctIndices)).toBe(true);
  expect(multiSelect.options).toEqual(["2", "3", "4"]);
  expect(multiSelect.correctIndices).toEqual([0, 1]);

  // ── 3. Clear DB and re-import ──
  await clearIndexedDB(page);

  await page.goto("/factory/import");
  await page.waitForLoadState("networkidle");

  // Upload the exported JSON
  const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
  await fileInput.setInputFiles(downloadPath);

  // Wait for preview to appear
  await expect(page.getByRole("heading", { name: /Standalone Cards \(\d+\)/ })).toBeVisible();

  // Click Import (use exact button text to avoid matching the "JSON Import" tab)
  await page.getByRole("button", { name: /Import \d+ Cards/ }).click();

  // Wait for import to finish (preview disappears)
  await expect(page.getByRole("heading", { name: /Standalone Cards \(\d+\)/ })).not.toBeVisible();

  // ── 4. Verify imported cards are not corrupted ──
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Capital of France")).toBeVisible();
  await expect(page.getByText("Solve 2+2")).toBeVisible();
  await expect(page.getByText("What is 2+2?")).toBeVisible();
  await expect(page.getByText("Select the prime numbers")).toBeVisible();

  // Deep-verify knowledge card
  await page.click("text=Capital of France");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Back" })).toBeVisible();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Explanation" })).toBeVisible();
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  // Deep-verify multi_radio card
  await page.click("text=What is 2+2?");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);
  // If options were corrupted, the Options section wouldn't render
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Options" })).toBeVisible();
  await expect(page.getByText("Correct")).toBeVisible();
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  // Deep-verify multi_select card
  await page.click("text=Select the prime numbers");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Options" })).toBeVisible();
  await expect(page.getByText("Correct")).toHaveCount(2);

  // Cleanup temp file
  await fs.promises.unlink(downloadPath);
  await fs.promises.rmdir(tmpDir);
});

test("SQT import creates multi_radio cards correctly", async ({ page }) => {
  await page.goto("/factory/import");
  await page.waitForLoadState("networkidle");

  // Switch to SQT mode
  await page.click("button:has-text('SQT Import')");

  const sqtContent = `Esercizio 1.
What is the capital of Italy?
A) Rome
B) Paris
C) Berlin
Risposta: A
Commento: Rome is the capital of Italy.

Esercizio 2.
Which planet is known as the Red Planet?
A) Earth
B) Mars
C) Jupiter
Risposta: B
`;

  const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.sqt`);
  await fs.promises.writeFile(tmpFile, sqtContent, "utf-8");

  const fileInput = page.locator('input[type="file"][accept*=".txt"]').first();
  await fileInput.setInputFiles(tmpFile);

  await expect(page.getByText("Parsed 2 questions")).toBeVisible();
  await page.getByRole("button", { name: /Import \d+ Cards/ }).click();

  // Wait for import to finish (parsed questions preview disappears on success)
  await expect(page.getByRole("heading", { name: /Parsed Questions \(\d+\)/ })).not.toBeVisible();

  // Verify in Study Dome
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("What is the capital of Italy?")).toBeVisible();
  await expect(page.getByText("Which planet is known as the Red Planet?")).toBeVisible();

  // View first card and verify options/explanation
  await page.click("text=What is the capital of Italy?");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Options" })).toBeVisible();
  await expect(page.getByText("Correct")).toBeVisible();
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Explanation" })).toBeVisible();

  await fs.promises.unlink(tmpFile);
});

test("JSON import with string-encoded options/correctIndices handles legacy exports", async ({ page }) => {
  // This simulates an old corrupted export where options/correctIndices were strings
  const legacyExport = {
    cards: [
      {
        type: "multi_radio",
        front: "Legacy export question",
        back: "B",
        explanation: null,
        options: '["A","B","C"]',
        correctIndices: '[1]',
        tagNames: [],
      },
      {
        type: "multi_select",
        front: "Legacy multi select",
        back: "A and B",
        explanation: null,
        options: '["A","B","C"]',
        correctIndices: '[0,1]',
        tagNames: [],
      },
    ],
  };

  const tmpFile = path.join(os.tmpdir(), `legacy-${Date.now()}.json`);
  await fs.promises.writeFile(tmpFile, JSON.stringify(legacyExport), "utf-8");

  await page.goto("/factory/import");
  await page.waitForLoadState("networkidle");

  const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
  await fileInput.setInputFiles(tmpFile);

  await expect(page.getByText("Parsed 2 cards")).toBeVisible();
  await page.getByRole("button", { name: /Import \d+ Cards/ }).click();

  // Wait for import to finish (preview disappears on success)
  await expect(page.getByRole("heading", { name: /Standalone Cards \(\d+\)/ })).not.toBeVisible();

  // Verify cards are usable (not corrupted)
  await page.goto("/study-dome/cards");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Legacy export question")).toBeVisible();
  await expect(page.getByText("Legacy multi select")).toBeVisible();

  // Click to verify options render without JSON parse errors
  await page.click("text=Legacy export question");
  await page.waitForURL(/\/study-dome\/cards\/\d+/);
  await expect(page.locator('[data-slot="card-title"]', { hasText: "Options" })).toBeVisible();
  await expect(page.getByText("Correct")).toBeVisible();

  await fs.promises.unlink(tmpFile);
});
