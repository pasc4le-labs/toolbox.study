"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useSync, type SyncStatus } from "@/hooks/use-sync";
import { loadSyncKey } from "@/lib/sync-storage";
import { validateSyncKey } from "@/lib/sync-identity";

type SyncContextValue = {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  progress: { current: number; total: number } | null;
  hasSyncKey: boolean;
  startSync: () => void;
  cancelSync: () => void;
  refreshSyncKey: () => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const syncState = useSync();

  const [hasSyncKey, setHasSyncKey] = useState(() => {
    const key = loadSyncKey();
    return !!key && validateSyncKey(key);
  });

  const refreshSyncKey = useCallback(() => {
    const key = loadSyncKey();
    setHasSyncKey(!!key && validateSyncKey(key));
  }, []);

  return (
    <SyncContext.Provider
      value={{
        ...syncState,
        hasSyncKey,
        refreshSyncKey,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
