import { test, expect, BrowserContext } from "@playwright/test";
import { clearIndexedDB, waitForDb } from "./setup";

test.describe("Exchange Center", () => {
  test("offer page renders and can create room", async ({ page }) => {
    await clearIndexedDB(page);
    await page.goto("/exchange-center/offer");
    await waitForDb(page);

    await expect(page.getByText("Offer Items")).toBeVisible();
    await expect(page.getByText("Create Room")).toBeDisabled();

    // Create a card first so there's something to select
    await page.goto("/study-dome/cards/new");
    await page.fill('input[name="front"]', "Test card front");
    await page.fill('input[name="back"]', "Test card back");
    await page.click('button[type="submit"]');

    await page.goto("/exchange-center/offer");
    await waitForDb(page);

    // Select the card
    await page.getByRole("checkbox").first().check();
    await expect(page.getByText("Create Room")).toBeEnabled();

    // Create room
    await page.getByText("Create Room").click();
    await expect(page.getByText("Waiting for peer...")).toBeVisible();

    // Room code should be displayed
    const code = await page.locator("button.font-mono").textContent();
    expect(code).toBeTruthy();
    expect(code!.trim().length).toBe(4);
  });

  test("receive page accepts room code", async ({ page }) => {
    await page.goto("/exchange-center/receive");
    await waitForDb(page);

    await expect(page.getByText("Receive Items")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. A3XK")).toBeVisible();

    // Enter invalid code
    await page.fill('input[placeholder="e.g. A3XK"]', "ZZZZ");
    await page.getByText("Connect").click();

    // Should show error
    await expect(page.getByText("room not found")).toBeVisible();
  });

  test("full exchange flow between two contexts", async ({ browser }) => {
    // This test requires WebRTC to work in the browser environment.
    // It may be flaky in headless mode depending on the environment.
    test.setTimeout(60000);

    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const sender = await senderContext.newPage();
    const receiver = await receiverContext.newPage();

    // Setup sender with a card
    await sender.goto("/");
    await clearIndexedDB(sender);
    await sender.goto("/study-dome/cards/new");
    await sender.fill('input[name="front"]', "Shared card");
    await sender.fill('input[name="back"]', "Shared answer");
    await sender.click('button[type="submit"]');

    // Sender creates room
    await sender.goto("/exchange-center/offer");
    await waitForDb(sender);
    await sender.getByRole("checkbox").first().check();
    await sender.getByText("Create Room").click();
    await expect(sender.getByText("Waiting for peer...")).toBeVisible();

    const roomCode = await sender.locator("button.font-mono").textContent();
    expect(roomCode).toBeTruthy();

    // Receiver connects
    await receiver.goto("/");
    await clearIndexedDB(receiver);
    await receiver.goto("/exchange-center/receive");
    await waitForDb(receiver);
    await receiver.fill('input[placeholder="e.g. A3XK"]', roomCode!.trim());
    await receiver.getByText("Connect").click();

    // Wait for connection
    await expect(sender.getByText("Peer connected!")).toBeVisible({ timeout: 15000 });
    await expect(receiver.getByText("Select Items to Import")).toBeVisible({ timeout: 15000 });

    // Receiver selects item and requests
    await receiver.getByRole("checkbox").first().check();
    await receiver.getByText("Request Items").click();

    // Wait for transfer to complete
    await expect(receiver.getByText("Import complete!")).toBeVisible({ timeout: 15000 });
    await expect(sender.getByText("Exchange complete!")).toBeVisible({ timeout: 15000 });

    // Verify receiver has the card
    await receiver.goto("/study-dome/cards");
    await waitForDb(receiver);
    await expect(receiver.getByText("Shared card")).toBeVisible();

    await senderContext.close();
    await receiverContext.close();
  });
});
