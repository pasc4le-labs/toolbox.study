import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
      testIgnore: ["**/responsive-layouts.spec.ts"],
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      testMatch: [
        "**/responsive-nav.spec.ts",
        "**/responsive-layouts.spec.ts",
      ],
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      testMatch: [
        "**/responsive-nav.spec.ts",
        "**/responsive-layouts.spec.ts",
      ],
    },
  ],
  webServer: {
    command: "cd .. && pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
