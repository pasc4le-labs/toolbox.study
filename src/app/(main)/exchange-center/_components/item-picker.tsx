"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RenderLatex } from "@/components/render-latex";

export type PickerItem = {
  id: number;
  name: string;
  meta?: string;
};

type Kind = "card" | "bundle" | "exam";

function toKey(kind: Kind, id: number): string {
  return `${kind}:${id}`;
}

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
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  const toggleAll = (keys: string[]) => {
    const next = new Set(selected);
    const allSelected = keys.every((k) => next.has(k));
    if (allSelected) {
      keys.forEach((k) => next.delete(k));
    } else {
      keys.forEach((k) => next.add(k));
    }
    onChange(next);
  };

  const renderList = (items: PickerItem[], kind: Kind) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {items.length} {kind}(s)
        </span>
        <button
          onClick={() => toggleAll(items.map((i) => toKey(kind, i.id)))}
          className="text-xs text-primary hover:underline"
        >
          {items.every((i) => selected.has(toKey(kind, i.id))) ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
        {items.map((item) => (
          <label
            key={toKey(kind, item.id)}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <Checkbox
              checked={selected.has(toKey(kind, item.id))}
              onCheckedChange={() => toggle(toKey(kind, item.id))}
            />
            <div className="flex-1">
              <div className="text-sm font-medium"><RenderLatex content={item.name} /></div>
              {item.meta && (
                <p className="text-xs text-muted-foreground">{item.meta}</p>
              )}
            </div>
          </label>
        ))}
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No {kind}s found
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
      <TabsContent value="cards">{renderList(cards, "card")}</TabsContent>
      <TabsContent value="bundles">{renderList(bundles, "bundle")}</TabsContent>
      <TabsContent value="exams">{renderList(exams, "exam")}</TabsContent>
    </Tabs>
  );
}