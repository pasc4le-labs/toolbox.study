"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { loadSyncKey } from "@/lib/sync-storage";
import { validateSyncKey } from "@/lib/sync-identity";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const hasShownRef = useRef(false);

  useEffect(() => {
    const key = loadSyncKey();
    if (key && validateSyncKey(key) && !hasShownRef.current) {
      hasShownRef.current = true;
      toast.info("Device sync is active");
    }
  }, []);

  return <>{children}</>;
}
