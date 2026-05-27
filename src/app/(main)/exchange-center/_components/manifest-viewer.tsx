"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ManifestItem } from "@/lib/exchange-protocol";

export function ManifestViewer({
  items,
  selected,
  onChange,
}: {
  items: ManifestItem[];
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
}) {
  const grouped = {
    card: items.filter((i) => i.kind === "card"),
    bundle: items.filter((i) => i.kind === "bundle"),
    exam: items.filter((i) => i.kind === "exam"),
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  const toggleGroup = (kind: keyof typeof grouped) => {
    const ids = grouped[kind].map((i) => i.id);
    const next = new Set(selected);
    const allSelected = ids.every((id) => next.has(id));
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    onChange(next);
  };

  const renderGroup = (kind: keyof typeof grouped, label: string) => {
    const groupItems = grouped[kind];
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold capitalize">{label}</h3>
          <button
            onClick={() => toggleGroup(kind)}
            className="text-xs text-primary hover:underline"
          >
            {groupItems.every((i) => selected.has(i.id))
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
        <div className="space-y-1">
          {groupItems.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => toggle(item.id)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{item.displayName}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {Object.entries(item.meta).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-[10px]">
                      {k}: {String(v)}
                    </Badge>
                  ))}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup("card", "Cards")}
      {renderGroup("bundle", "Bundles")}
      {renderGroup("exam", "Exams")}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selected.size} of {items.length} selected
        </span>
      </div>
    </div>
  );
}
