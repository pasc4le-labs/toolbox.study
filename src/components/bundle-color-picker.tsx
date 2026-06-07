"use client";

import { useState } from "react";
import { RiPaletteLine } from "@remixicon/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUNDLE_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78716c",
  "#64748b",
  "#334155",
] as const;

interface BundleColorPickerProps {
  color: string | null;
  onColorChange: (color: string | null) => void;
}

export function BundleColorPicker({ color, onColorChange }: BundleColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Pick cover color"
            className={cn(
              "h-10 w-10 rounded-md border-2 transition-all",
              color
                ? "border-foreground/20 hover:border-foreground/40"
                : "border-dashed border-input bg-background",
            )}
            style={color ? { backgroundColor: color } : undefined}
          >
            {!color && <RiPaletteLine className="mx-auto h-4 w-4 text-muted-foreground" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="grid grid-cols-6 gap-2">
            {BUNDLE_COLORS.map((c) => {
              const isSelected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onColorChange(c);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-8 w-8 rounded-md border-2 transition-all hover:scale-110",
                    isSelected
                      ? "border-foreground ring-2 ring-foreground/30"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
          {color && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                onColorChange(null);
                setOpen(false);
              }}
            >
              Remove color
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {color && (
        <span className="text-xs text-muted-foreground">{color.toUpperCase()}</span>
      )}
    </div>
  );
}
