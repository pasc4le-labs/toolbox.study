import { Page } from "@playwright/test";

/**
 * Clear all database state before each test.
 * Uses the __nukeDb function exposed by the app in development mode.
 */
export async function clearIndexedDB(page: Page) {
  // Navigate to the app first so the DbReset component initializes
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Call the exposed nukeDb function
  await page.evaluate(() => {
    return (window as unknown as { __nukeDb?: () => Promise<void> }).__nukeDb?.();
  });

  // Reload so the DB is re-created fresh
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/**
 * Wait for the database to be ready after navigation.
 */
export async function waitForDb(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}
