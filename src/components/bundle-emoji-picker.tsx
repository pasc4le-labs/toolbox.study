"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { EmojiStyle, Theme } from "emoji-picker-react";
import { RiEmotionLine } from "@remixicon/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface BundleEmojiPickerProps {
  emoji: string | null;
  onEmojiChange: (emoji: string | null) => void;
}

export function BundleEmojiPicker({ emoji, onEmojiChange }: BundleEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Pick emoji"
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-md border-2 border-input bg-background text-2xl transition-colors hover:bg-accent",
              !emoji && "text-muted-foreground",
            )}
          >
            {emoji ? <span className="leading-none">{emoji}</span> : <RiEmotionLine className="h-5 w-5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Picker
            onEmojiClick={(data: EmojiClickData) => {
              onEmojiChange(data.emoji);
              setOpen(false);
            }}
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.AUTO}
          />
        </PopoverContent>
      </Popover>
      {emoji && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEmojiChange(null)}
        >
          Remove emoji
        </Button>
      )}
    </div>
  );
}
