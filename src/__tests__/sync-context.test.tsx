import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Suppress console.error for expected error tests
let consoleError: typeof console.error;
beforeEach(() => {
  consoleError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = consoleError;
});

const mockUseSync = vi.fn();
const mockLoadSyncKey = vi.fn();
const mockValidateSyncKey = vi.fn();

vi.mock("@/hooks/use-sync", () => ({
  useSync: (...args: unknown[]) => mockUseSync(...args),
}));

vi.mock("@/lib/sync-storage", () => ({
  loadSyncKey: (...args: unknown[]) => mockLoadSyncKey(...args),
}));

vi.mock("@/lib/sync-identity", () => ({
  validateSyncKey: (...args: unknown[]) => mockValidateSyncKey(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSync.mockReturnValue({
    status: "idle",
    lastSyncedAt: null,
    error: null,
    progress: null,
    startSync: vi.fn(),
    cancelSync: vi.fn(),
  });
});

describe("SyncContext", () => {
  it("useSyncContext is a function", async () => {
    const { useSyncContext } = await import("@/components/sync-provider");
    expect(typeof useSyncContext).toBe("function");
  });

  it("useSyncContext throws when called outside SyncProvider", async () => {
    const { useSyncContext: ctx } = await import("@/components/sync-provider");

    function BadComponent() {
      ctx();
      return null;
    }

    expect(() => renderToStaticMarkup(React.createElement(BadComponent))).toThrow("useSyncContext must be used within SyncProvider");
  });

  it("SyncProvider renders children", async () => {
    const { SyncProvider } = await import("@/components/sync-provider");
    const html = renderToStaticMarkup(
      React.createElement(SyncProvider, null,
        React.createElement("span", { "data-testid": "child" }, "hello"),
      ),
    );
    expect(html).toContain("hello");
  });

  it("hasSyncKey is false when loadSyncKey returns null", async () => {
    mockLoadSyncKey.mockReturnValue(null);
    mockValidateSyncKey.mockReturnValue(false);

    const { SyncProvider, useSyncContext } = await import("@/components/sync-provider");

    function TestConsumer() {
      const { hasSyncKey } = useSyncContext();
      return React.createElement("div", { "data-has-sync-key": String(hasSyncKey) });
    }

    const html = renderToStaticMarkup(
      React.createElement(SyncProvider, null,
        React.createElement(TestConsumer),
      ),
    );
    expect(html).toContain('data-has-sync-key="false"');
  });

  it("hasSyncKey is true when loadSyncKey returns a valid key", async () => {
    mockLoadSyncKey.mockReturnValue("valid key phrase here words twelve total must be");
    mockValidateSyncKey.mockReturnValue(true);

    const { SyncProvider, useSyncContext } = await import("@/components/sync-provider");

    function TestConsumer() {
      const { hasSyncKey } = useSyncContext();
      return React.createElement("div", { "data-has-sync-key": String(hasSyncKey) });
    }

    const html = renderToStaticMarkup(
      React.createElement(SyncProvider, null,
        React.createElement(TestConsumer),
      ),
    );
    expect(html).toContain('data-has-sync-key="true"');
  });

  it("sync state from useSync is exposed through context", async () => {
    mockLoadSyncKey.mockReturnValue(null);
    mockValidateSyncKey.mockReturnValue(false);
    mockUseSync.mockReturnValue({
      status: "syncing",
      lastSyncedAt: null,
      error: null,
      progress: { current: 3, total: 10 },
      startSync: vi.fn(),
      cancelSync: vi.fn(),
    });

    const { SyncProvider, useSyncContext } = await import("@/components/sync-provider");

    function TestConsumer() {
      const { status, progress } = useSyncContext();
      return React.createElement("div", {
        "data-status": status,
        "data-progress-current": String(progress?.current ?? ""),
        "data-progress-total": String(progress?.total ?? ""),
      });
    }

    const html = renderToStaticMarkup(
      React.createElement(SyncProvider, null,
        React.createElement(TestConsumer),
      ),
    );
    expect(html).toContain('data-status="syncing"');
    expect(html).toContain('data-progress-current="3"');
    expect(html).toContain('data-progress-total="10"');
  });
});
