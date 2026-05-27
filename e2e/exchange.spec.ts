import { test, expect } from "@playwright/test";
import { waitForDb } from "./setup";

test.describe("Exchange Center", () => {
  test("overview page renders with CTAs", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await expect(page.getByRole("heading", { name: "Exchange Center" })).toBeVisible();
    await expect(page.getByText("Offer Items")).toBeVisible();
    await expect(page.getByText("Receive Items")).toBeVisible();
  });

  test("can navigate to offer page", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await page.getByText("Offer Items").click();
    await expect(page).toHaveURL(/\/exchange-center\/offer$/);
    await expect(page.getByRole("button", { name: "Create Room" })).toBeVisible();
  });

  test("can navigate to receive page", async ({ page }) => {
    await page.goto("/exchange-center");
    await waitForDb(page);

    await page.getByText("Receive Items").click();
    await expect(page).toHaveURL(/\/exchange-center\/receive$/);
    await expect(page.getByPlaceholder("e.g. A3XK")).toBeVisible();
  });

  test("offer page shows disabled button when no items selected", async ({ page }) => {
    await page.goto("/exchange-center/offer");
    await waitForDb(page);

    await expect(page.getByRole("button", { name: "Create Room" })).toBeDisabled();
  });

  test("receive page accepts room code input", async ({ page }) => {
    await page.goto("/exchange-center/receive");
    await waitForDb(page);

    const input = page.getByPlaceholder("e.g. A3XK");
    await input.fill("ABCD");
    await expect(input).toHaveValue("ABCD");
    await expect(page.getByRole("button", { name: "Connect" })).toBeEnabled();
  });
});
