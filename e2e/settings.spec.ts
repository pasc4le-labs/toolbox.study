import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("General tab is active by default and stats are visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute("data-state", "active");
    await expect(page.getByText("Database Statistics")).toBeVisible();
    await expect(page.getByText("Cards", { exact: true })).toBeVisible();
    await expect(page.getByText("Bundles", { exact: true })).toBeVisible();
  });

  test("Preferences tab shows theme selector and relay input", async ({ page }) => {
    await page.getByRole("tab", { name: "Preferences" }).click();
    await expect(page.locator("h2").filter({ hasText: "Theme" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();
    await expect(page.getByRole("button", { name: "System" })).toBeVisible();
    await expect(page.getByText("Relay Server")).toBeVisible();
    await expect(page.getByLabel("Hostname")).toBeVisible();
  });

  test("Syncing tab renders", async ({ page }) => {
    await page.getByRole("tab", { name: "Syncing" }).click();
    await expect(page.locator("h2").filter({ hasText: "Sync Key" })).toBeVisible();
  });

  test("About tab shows version and links", async ({ page }) => {
    await page.getByRole("tab", { name: "About" }).click();
    await expect(page.getByText(/^StudyToolbox/)).toBeVisible();
    await expect(page.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();
    await expect(page.getByText("EUPL v1.2")).toBeVisible();
    await expect(page.getByText("GitHub", { exact: true })).toBeVisible();
  });

  test("navigating to /settings?tab=syncing activates Syncing tab", async ({ page }) => {
    await page.goto("/settings?tab=syncing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: "Syncing" })).toHaveAttribute("data-state", "active");
  });

  test("navigating to /sync redirects to /settings?tab=syncing", async ({ page }) => {
    await page.goto("/sync");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\?tab=syncing/);
    await expect(page.getByRole("tab", { name: "Syncing" })).toHaveAttribute("data-state", "active");
  });

  test("settings icon is visible in navbar", async ({ page }) => {
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
  });

  test("mobile nav has Settings link", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});
