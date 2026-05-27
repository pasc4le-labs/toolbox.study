"use client";

import { useEffect } from "react";
import { nukeDb } from "@/db";

/**
 * Exposes database reset functions for E2E testing in development mode.
 */
export function DbReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__nukeDb = nukeDb;
    }
  }, []);

  return null;
}
