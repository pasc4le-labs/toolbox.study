"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RiLoopLeftLine, RiCloseCircleLine, RiCheckLine,
  RiProgress1Line, RiProgress2Line, RiProgress3Line, RiProgress4Line,
  RiProgress5Line, RiProgress6Line, RiProgress7Line, RiProgress8Line,
} from "@remixicon/react";
import type { ComponentType } from "react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSyncContext } from "@/components/sync-provider";

const PROGRESS_ICONS = [
  RiProgress1Line, RiProgress2Line, RiProgress3Line, RiProgress4Line,
  RiProgress5Line, RiProgress6Line, RiProgress7Line, RiProgress8Line,
];

export function SyncButton() {
  const { status, error, hasSyncKey, startSync, cancelSync } = useSyncContext();
  const router = useRouter();

  const [progressIndex, setProgressIndex] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const prevErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "connecting" || status === "waiting" || status === "syncing") {
      const interval = setInterval(() => {
        setProgressIndex((i) => (i + 1) % PROGRESS_ICONS.length);
      }, 300);
      return () => clearInterval(interval);
    }
  }, [status]);

  useEffect(() => {
    if (status === "complete") {
      startTransition(() => setShowComplete(true));
      const timer = setTimeout(() => startTransition(() => setShowComplete(false)), 3000);
      return () => clearTimeout(timer);
    }
    startTransition(() => setShowComplete(false));
  }, [status]);

  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      prevErrorRef.current = error;
      toast.error("Sync failed", { description: error });
    }
    if (!error) {
      prevErrorRef.current = null;
    }
  }, [error]);

  let Icon: ComponentType<{ className?: string }>;
  let tooltipText: string | null = null;
  let ariaLabel: string;

  if (!hasSyncKey) {
    Icon = RiLoopLeftLine;
    tooltipText = "Set up device sync";
    ariaLabel = "Set up device sync";
  } else if (status === "error") {
    Icon = RiCloseCircleLine;
    tooltipText = error;
    ariaLabel = `Sync error: ${error}`;
  } else if (status === "connecting" || status === "waiting" || status === "syncing") {
    Icon = PROGRESS_ICONS[progressIndex];
    tooltipText = status === "connecting" ? "Connecting\u2026" : status === "waiting" ? "Waiting for peer\u2026" : "Syncing\u2026";
    ariaLabel = tooltipText;
  } else if (status === "complete" && showComplete) {
    Icon = RiCheckLine;
    tooltipText = "Sync complete";
    ariaLabel = "Sync complete";
  } else {
    Icon = RiLoopLeftLine;
    tooltipText = "Sync now";
    ariaLabel = "Sync now";
  }

  const handleClick = useCallback(() => {
    if (!hasSyncKey) {
      router.push("/settings/syncing");
      return;
    }
    if (status === "connecting" || status === "waiting" || status === "syncing") {
      cancelSync();
      return;
    }
    startSync();
  }, [hasSyncKey, status, startSync, cancelSync, router]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            aria-label={ariaLabel}
            className={cn(
              "text-muted-foreground transition-colors hover:text-foreground",
              (status === "connecting" || status === "waiting" || status === "syncing") && "text-blue-600 dark:text-blue-400",
              status === "complete" && showComplete && "text-green-600 dark:text-green-400",
              status === "error" && "text-red-600 dark:text-red-400",
            )}
          >
            <Icon className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        {tooltipText && (
          <TooltipContent>{tooltipText}</TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
