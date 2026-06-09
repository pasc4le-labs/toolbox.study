import { test, expect } from "@playwright/test";

const isMobile = (projectName: string) =>
  projectName === "mobile-chrome" || projectName === "mobile-safari";

test.describe("Navbar sync button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("desktop: sync button is visible in navbar and navigates to sync settings", async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), "Desktop-only test");

    const header = page.locator("header");
    const desktopNav = header.locator("nav");

    const syncButton = desktopNav.getByRole("button", { name: /sync/i });
    await expect(syncButton).toBeVisible();

    await syncButton.click();
    await expect(page).toHaveURL(/\/settings\/syncing$/);
  });

  test("mobile: Sync link appears in nav drawer and navigates to sync settings", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");

    await page.locator("header").getByRole("button", { name: "Open menu" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const syncLink = sheet.getByRole("link", { name: "Sync" });
    await expect(syncLink).toBeVisible();

    await syncLink.click();
    await expect(page).toHaveURL(/\/settings\/syncing$/);
  });
});
