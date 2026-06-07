import { test, expect } from "@playwright/test";

const isMobile = (projectName: string) =>
  projectName === "mobile-chrome" || projectName === "mobile-safari";

test.describe("Responsive navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("desktop navbar shows inline nav links and hides hamburger", async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), "Desktop-only test");

    const header = page.locator("header");
    const desktopNav = header.locator("nav");

    await expect(header.getByRole("button", { name: "Open menu" })).toBeHidden();
    await expect(desktopNav).toBeVisible();
    await expect(desktopNav.getByRole("link", { name: "Study Dome" })).toBeVisible();
    await expect(desktopNav.getByRole("link", { name: "Factory" })).toBeVisible();
    await expect(
      desktopNav.getByRole("link", { name: "Exchange Center" }),
    ).toBeVisible();
  });

  test("mobile navbar shows hamburger and hides inline nav links", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");

    const header = page.locator("header");
    await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible();

    // The desktop <nav> inside the header is display:none below md.
    await expect(header.locator("nav")).toBeHidden();
  });

  test("mobile Sheet contains all nav links and a ModeToggle", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");

    await page.locator("header").getByRole("button", { name: "Open menu" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole("link", { name: "Study Dome" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Factory" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Exchange Center" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Toggle theme" })).toBeVisible();
  });

  test("clicking a link inside the mobile Sheet navigates and closes it", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");

    await page.locator("header").getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await sheet.getByRole("link", { name: "Factory" }).click();

    await expect(page).toHaveURL(/\/factory$/);
    await expect(sheet).toBeHidden();
  });

  test("ModeToggle is always present in the navbar", async ({ page }) => {
    const header = page.locator("header");
    await expect(header.getByRole("button", { name: "Toggle theme" })).toBeVisible();
  });

  test("study-dome sub-nav is horizontally scrollable on mobile", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");

    await page.goto("/study-dome");
    await page.waitForLoadState("networkidle");

    const subNav = page.locator("nav.no-scrollbar").first();
    await expect(subNav).toBeVisible();

    const overflowX = await subNav.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(overflowX).toBe("auto");
  });
});
