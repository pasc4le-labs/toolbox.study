import { test, expect } from "@playwright/test";

const isMobile = (projectName: string) =>
  projectName === "mobile-chrome" || projectName === "mobile-safari";

const keyPages = [
  "/",
  "/study-dome",
  "/study-dome/bundles",
  "/study-dome/cards",
  "/study-dome/tags",
  "/study-dome/review",
  "/factory",
  "/factory/generate",
  "/factory/import",
  "/factory/export",
  "/factory/tagger",
  "/exchange-center",
  "/exchange-center/offer",
  "/exchange-center/receive",
] as const;

test.describe("Responsive layouts (mobile)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "Mobile-only test");
  });

  for (const path of keyPages) {
    test(`${path} has no horizontal overflow on mobile`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Allow 1px tolerance for sub-pixel rounding.
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("primary CTA buttons on study-dome are visible and inside the viewport", async ({
    page,
  }) => {
    await page.goto("/study-dome");
    await page.waitForLoadState("networkidle");

    const startReview = page.getByRole("link", { name: /Start Review/i }).first();
    const newCard = page.getByRole("link", { name: /New Card/i }).first();

    for (const cta of [startReview, newCard]) {
      if ((await cta.count()) === 0) continue;
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        const viewport = page.viewportSize();
        if (viewport) {
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
    }
  });

  test("review page rating buttons stack into 2 columns on mobile", async ({
    page,
  }) => {
    await page.goto("/study-dome/review");
    await page.waitForLoadState("networkidle");

    // Review may show an empty state with no rating grid; skip if so.
    const ratingGrid = page.locator(".grid-cols-2").first();
    if ((await ratingGrid.count()) === 0) {
      test.info().annotations.push({
        type: "skip",
        description: "No active review session to render rating grid",
      });
      return;
    }

    await expect(ratingGrid).toBeVisible();
    // The grid columns should be 2 on mobile (per sm:grid-cols-4).
    const cols = await ratingGrid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(cols).toBe(2);
  });
});
