import { test, expect } from "@playwright/test";

test.describe("Dark mode", () => {
  test.beforeEach(async ({ page }) => {
    // Reset to system default by clearing the next-themes localStorage key.
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("theme"));
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("ModeToggle button is visible in the navbar", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Toggle theme" }),
    ).toBeVisible();
  });

  test("dropdown shows Light, Dark, and System options", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle theme" }).click();

    await expect(page.getByRole("menuitem", { name: /^Light/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^Dark/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^System/ })).toBeVisible();
  });

  test("selecting Dark applies the dark class on <html>", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Dark/ }).click();

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  test("selecting Light removes the dark class on <html>", async ({ page }) => {
    // First go dark
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // Then go light
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Light/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });

  test("theme persists across page reload", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  test("navbar logo swaps between light and dark variants", async ({
    page,
  }) => {
    // In light mode, only the light Logo SVG should be visible inside the
    // home Link.
    const homeLink = page.getByRole("link", { name: "StudyToolbox home" });
    const visibleSvgs = homeLink.locator("svg:visible");

    // Force light first to have a stable baseline.
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Light/ }).click();
    await expect(homeLink).toBeVisible();
    await expect(visibleSvgs).toHaveCount(1);

    // Switch to dark
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: /^Dark/ }).click();
    await expect(visibleSvgs).toHaveCount(1);
  });
});
