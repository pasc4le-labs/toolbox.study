"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { getDb, nukeDb } from "@/db";
import { getStats, type AppStats } from "@/lib/services";
import { toast } from "sonner";

type SettingsContextValue = {
  stats: AppStats | null;
  loading: boolean;
  refetchStats: () => Promise<void>;
  handleNukeDb: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      try {
        const { db, sqlDb } = await getDb();
        const s = await getStats(db);
        const byteLength = sqlDb.export().byteLength;
        if (mountedRef.current) setStats({ ...s, dbSizeKB: byteLength / 1024 });
      } catch {
        // DB not available yet
      }
      if (mountedRef.current) setLoading(false);
    };
    load();
    return () => { mountedRef.current = false; };
  }, []);

  const refetchStats = useCallback(async () => {
    try {
      const { db, sqlDb } = await getDb();
      const s = await getStats(db);
      const byteLength = sqlDb.export().byteLength;
      setStats({ ...s, dbSizeKB: byteLength / 1024 });
    } catch {
      // DB not available
    }
  }, []);

  const handleNukeDb = useCallback(async () => {
    await nukeDb();
    toast.success("Database nuked. Reloading...");
    window.location.reload();
  }, []);

  return (
    <SettingsContext.Provider value={{ stats, loading, refetchStats, handleNukeDb }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
