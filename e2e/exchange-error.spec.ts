import { test, expect } from "@playwright/test";
import { clearIndexedDB, waitForDb } from "./setup";

test.describe("Exchange Center error recovery", () => {
  test("invalid room code shows error", async ({ page }) => {
    await page.goto("/exchange-center/receive");
    await waitForDb(page);

    await page.fill('input[placeholder="e.g. A3XK"]', "ZZZZ");
    await page.getByText("Connect").click();

    await expect(page.getByText(/room not found|error/i)).toBeVisible();
  });

  test("peer disconnect shows error on receiver", async ({ browser }) => {
    test.setTimeout(60000);

    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const sender = await senderContext.newPage();
    const receiver = await receiverContext.newPage();

    // Setup sender
    await sender.goto("/");
    await clearIndexedDB(sender);
    await sender.goto("/study-dome/cards/new");
    await sender.fill('input[name="front"]', "Disconnect test");
    await sender.fill('input[name="back"]', "Answer");
    await sender.click('button[type="submit"]');

    // Sender creates room
    await sender.goto("/exchange-center/offer");
    await waitForDb(sender);
    await sender.getByRole("checkbox").first().check();
    await sender.getByText("Create Room").click();
    await expect(sender.getByText("Waiting for peer...")).toBeVisible();

    const roomCode = await sender.locator("button.font-mono").textContent();

    // Receiver connects
    await receiver.goto("/");
    await clearIndexedDB(receiver);
    await receiver.goto("/exchange-center/receive");
    await waitForDb(receiver);
    await receiver.fill('input[placeholder="e.g. A3XK"]', roomCode!.trim());
    await receiver.getByText("Connect").click();

    // Wait for connection
    await expect(sender.getByText("Peer connected!")).toBeVisible({ timeout: 15000 });

    // Sender closes tab
    await sender.close();

    // Receiver should see error
    await expect(
      receiver.getByText(/Peer disconnected|Connection closed|error/i),
    ).toBeVisible({ timeout: 10000 });

    await senderContext.close();
    await receiverContext.close();
  });
});
