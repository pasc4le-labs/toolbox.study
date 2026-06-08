import { request } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

const ROUTES = [
  "/",
  "/study-dome",
  "/study-dome/cards",
  "/study-dome/cards/new",
  "/study-dome/cards/1",
  "/study-dome/cards/1/edit",
  "/study-dome/tags",
  "/study-dome/bundles",
  "/study-dome/bundles/1",
  "/study-dome/exams",
  "/study-dome/review",
  "/factory",
  "/factory/generate",
  "/factory/import",
  "/factory/export",
  "/factory/tagger",
  "/exchange-center",
  "/exchange-center/offer",
  "/exchange-center/receive",
  "/settings",
];

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  await waitForServer(BASE_URL, 60_000);

  const ctx = await request.newContext({ baseURL: BASE_URL });
  for (const route of ROUTES) {
    try {
      await ctx.get(route, { timeout: 30_000 });
    } catch {
      // ignore individual route warmup failures
    }
  }
  await ctx.dispose();
}
