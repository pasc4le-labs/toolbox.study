import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockUseSyncContext = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("@/components/sync-provider", () => ({
  useSyncContext: (...args: unknown[]) => mockUseSyncContext(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SyncButton", () => {
  it("is exported as a function component", async () => {
    const { SyncButton } = await import("@/components/sync-button");
    expect(typeof SyncButton).toBe("function");
  });

  it("renders with idle status and no sync key", async () => {
    mockUseSyncContext.mockReturnValue({
      status: "idle",
      error: null,
      hasSyncKey: false,
      startSync: vi.fn(),
      cancelSync: vi.fn(),
    });

    const { SyncButton } = await import("@/components/sync-button");
    const html = renderToStaticMarkup(React.createElement(SyncButton));
    expect(html).toContain("Set up device sync");
  });

  it("renders with idle status and sync key", async () => {
    mockUseSyncContext.mockReturnValue({
      status: "idle",
      error: null,
      hasSyncKey: true,
      startSync: vi.fn(),
      cancelSync: vi.fn(),
    });

    const { SyncButton } = await import("@/components/sync-button");
    const html = renderToStaticMarkup(React.createElement(SyncButton));
    expect(html).toContain("Sync now");
  });

  it("renders connecting status", async () => {
    mockUseSyncContext.mockReturnValue({
      status: "connecting",
      error: null,
      hasSyncKey: true,
      startSync: vi.fn(),
      cancelSync: vi.fn(),
    });

    const { SyncButton } = await import("@/components/sync-button");
    const html = renderToStaticMarkup(React.createElement(SyncButton));
    expect(html).toContain("Connecting");
  });

  it("renders error status", async () => {
    mockUseSyncContext.mockReturnValue({
      status: "error",
      error: "Connection refused",
      hasSyncKey: true,
      startSync: vi.fn(),
      cancelSync: vi.fn(),
    });

    const { SyncButton } = await import("@/components/sync-button");
    const html = renderToStaticMarkup(React.createElement(SyncButton));
    expect(html).toContain("Connection refused");
  });
});
