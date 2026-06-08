"use client";

import {
  RiFileTextLine, RiFolderLine, RiPriceTag3Line,
  RiFileListLine, RiCheckDoubleLine, RiRefreshLine,
  RiDeleteBinLine, RiDatabase2Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { useSettings } from "./settings-provider";

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function GeneralTab() {
  const { stats, loading, handleNukeDb } = useSettings();

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiDatabase2Line className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Database Statistics</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard icon={RiFileTextLine} label="Cards" value={stats.cards} />
          <StatCard icon={RiFolderLine} label="Bundles" value={stats.bundles} />
          <StatCard icon={RiPriceTag3Line} label="Tags" value={stats.tags} />
          <StatCard icon={RiFileListLine} label="Exams" value={stats.exams} />
          <StatCard icon={RiCheckDoubleLine} label="Exam Attempts" value={stats.examAttempts} />
          <StatCard icon={RiRefreshLine} label="Reviews" value={stats.reviewLogs} />
          <StatCard icon={RiDatabase2Line} label="DB Size" value={stats.dbSizeKB ? `${stats.dbSizeKB.toFixed(1)} KB` : '\u2014'} />
        </div>
      </div>

      <div className="rounded-2xl border border-red-200 bg-card p-6 dark:border-red-900">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This will permanently delete all your data, including cards, bundles, exams, and AI provider configurations.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <RiDeleteBinLine className="mr-2 h-4 w-4" />
              Nuke Database
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuke Database?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. All cards, bundles, tags, exams, attempts, review logs, and AI provider configurations will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleNukeDb}>
                Nuke Everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
