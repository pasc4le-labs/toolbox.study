"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export type PickerItem = {
  id: number;
  name: string;
  meta?: string;
};

export function ItemPicker({
  cards,
  bundles,
  exams,
  selected,
  onChange,
}: {
  cards: PickerItem[];
  bundles: PickerItem[];
  exams: PickerItem[];
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
}) {
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  const toggleAll = (ids: number[]) => {
    const next = new Set(selected);
    const allSelected = ids.every((id) => next.has(id));
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    onChange(next);
  };

  const renderList = (items: PickerItem[], kind: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {items.length} {kind}(s)
        </span>
        <button
          onClick={() => toggleAll(items.map((i) => i.id))}
          className="text-xs text-primary hover:underline"
        >
          {items.every((i) => selected.has(i.id)) ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => toggle(item.id)}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">{item.name}</p>
              {item.meta && (
                <p className="text-xs text-muted-foreground">{item.meta}</p>
              )}
            </div>
          </label>
        ))}
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No {kind.toLowerCase()}s found
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Tabs defaultValue="cards">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="cards">
          Cards <Badge variant="secondary" className="ml-1">{cards.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="bundles">
          Bundles <Badge variant="secondary" className="ml-1">{bundles.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="exams">
          Exams <Badge variant="secondary" className="ml-1">{exams.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cards">{renderList(cards, "Card")}</TabsContent>
      <TabsContent value="bundles">{renderList(bundles, "Bundle")}</TabsContent>
      <TabsContent value="exams">{renderList(exams, "Exam")}</TabsContent>
    </Tabs>
  );
}
