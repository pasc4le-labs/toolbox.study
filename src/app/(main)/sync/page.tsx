"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  RiShieldKeyholeLine, RiDeleteBinLine, RiRefreshLine,
  RiCheckLine, RiFileCopyLine, RiLink,
} from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { generateSyncKey, validateSyncKey } from "@/lib/sync-identity";
import {
  storeSyncKey, loadSyncKey, deleteSyncKey, loadLastSyncedAt,
} from "@/lib/sync-storage";
import { useSync, type SyncStatus } from "@/hooks/use-sync";

function SyncStatusIndicator({ status, error }: { status: SyncStatus; error: string | null }) {
  switch (status) {
    case "idle":
      return <span className="text-muted-foreground">Not connected</span>;
    case "connecting":
      return <span className="text-amber-600 dark:text-amber-400">Connecting...</span>;
    case "waiting":
      return <span className="text-amber-600 dark:text-amber-400">Waiting for another device...</span>;
    case "syncing":
      return <span className="text-blue-600 dark:text-blue-400">Syncing...</span>;
    case "complete":
      return <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><RiCheckLine className="h-4 w-4" />Sync complete</span>;
    case "error":
      return <span className="text-red-600 dark:text-red-400">Error: {error}</span>;
  }
}

function WordDisplay({ words }: { words: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {words.map((word, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
        >
          <span className="text-xs text-muted-foreground w-5 text-right tabular-nums">
            {i + 1}.
          </span>
          <span className="font-mono text-foreground">{word}</span>
        </div>
      ))}
    </div>
  );
}

export default function SyncPage() {
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    status,
    lastSyncedAt,
    error,
    progress,
    startSync,
    cancelSync,
  } = useSync();

  useEffect(() => {
    requestAnimationFrame(() => {
      setStoredKey(loadSyncKey());
    });
  }, []);

  const handleGenerate = useCallback(() => {
    const key = generateSyncKey();
    storeSyncKey(key);
    setStoredKey(key);
    toast.success("Sync key generated");
  }, []);

  const handleSaveInput = useCallback(() => {
    const trimmed = inputKey.trim().toLowerCase();
    if (!validateSyncKey(trimmed)) {
      setInputError("Invalid mnemonic. Enter exactly 12 space-separated BIP39 words.");
      return;
    }
    setInputError(null);
    storeSyncKey(trimmed);
    setStoredKey(trimmed);
    toast.success("Sync key saved");
  }, [inputKey]);

  const handleDelete = useCallback(() => {
    deleteSyncKey();
    setStoredKey(null);
    setShowDeleteDialog(false);
    cancelSync();
    toast.success("Sync key deleted");
  }, [cancelSync]);

  const handleCopy = useCallback(() => {
    if (storedKey) {
      navigator.clipboard.writeText(storedKey);
      toast.success("Copied to clipboard");
    }
  }, [storedKey]);

  const handleSyncNow = useCallback(() => {
    startSync();
  }, [startSync]);

  const words = storedKey ? storedKey.split(" ") : [];
  const lastSyncedDisplay = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString()
    : null;

  return (
    <Boxed className="py-8 md:py-12">
      <div className="mb-8 space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Device Sync
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Automatically sync your study data across devices via direct P2P connection.
          Your data never passes through our servers.
        </p>
      </div>

      <div className="space-y-8">
        {/* Sync Key Section */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <RiShieldKeyholeLine className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Sync Key</h2>
          </div>

          {!storedKey ? (
            <div className="space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  A sync key is a 12-word mnemonic phrase that identifies your device group.
                  Generate a new one or enter an existing key to join a group.
                </p>
                <Button onClick={handleGenerate}>
                  <RiShieldKeyholeLine className="mr-2 h-4 w-4" />
                  Generate New Sync Key
                </Button>
              </div>

              <div className="border-t pt-6">
                <label className="text-sm font-medium mb-2 block">
                  Enter Existing Key
                </label>
                <div className="flex gap-2">
                  <Input
                    value={inputKey}
                    onChange={(e) => { setInputKey(e.target.value); setInputError(null); }}
                    placeholder="Paste 12 words here..."
                    className="flex-1"
                  />
                  <Button onClick={handleSaveInput} variant="secondary">
                    <RiCheckLine className="mr-2 h-4 w-4" />
                    Validate & Save
                  </Button>
                </div>
                {inputError && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2">{inputError}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Write these words down. They are the only way to sync your data to another device.
                </p>
              </div>

              <WordDisplay words={words} />

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleCopy} variant="secondary" size="sm">
                  <RiFileCopyLine className="mr-2 h-4 w-4" />
                  Copy Key
                </Button>
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <RiDeleteBinLine className="mr-2 h-4 w-4" />
                      Delete Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Sync Key?</DialogTitle>
                      <DialogDescription>
                        This will stop syncing data. You can re-enter the same key later to resume syncing.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                      </DialogClose>
                      <Button variant="destructive" onClick={handleDelete}>
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          )}
        </div>

        {/* Sync Status Section */}
        {storedKey && (
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <RiLink className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Sync Status</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <SyncStatusIndicator status={status} error={error} />
              </div>

              {progress && (
                <div className="space-y-1">
                  <Progress value={(progress.current / progress.total) * 100} />
                  <p className="text-xs text-muted-foreground text-right">
                    {progress.current} / {progress.total} chunks
                  </p>
                </div>
              )}

              {lastSyncedDisplay && (
                <p className="text-sm text-muted-foreground">
                  Last synced: {lastSyncedDisplay}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSyncNow}
                  disabled={status === "connecting" || status === "syncing" || status === "waiting"}
                  size="sm"
                >
                  <RiRefreshLine className="mr-2 h-4 w-4" />
                  Sync Now
                </Button>
                {(status === "connecting" || status === "syncing" || status === "waiting") && (
                  <Button onClick={cancelSync} variant="secondary" size="sm">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Boxed>
  );
}
