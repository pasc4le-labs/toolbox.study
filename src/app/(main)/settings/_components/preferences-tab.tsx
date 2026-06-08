"use client";

import { useState, useCallback } from "react";
import { RiPaintBrushLine, RiCloudLine } from "@remixicon/react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loadRelayHostname, storeRelayHostname, buildRelayUrl } from "@/lib/relay-prefs";
import { toast } from "sonner";

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const [relayHostname, setRelayHostname] = useState(loadRelayHostname);

  const handleSaveRelay = useCallback(() => {
    const trimmed = relayHostname.trim();
    if (!trimmed) {
      toast.error("Hostname cannot be empty");
      return;
    }
    storeRelayHostname(trimmed);
    toast.success("Relay hostname saved. Changes take effect on next sync connection.");
  }, [relayHostname]);

  const relayPreview = buildRelayUrl(relayHostname.trim() || loadRelayHostname());

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <RiPaintBrushLine className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Theme</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <Button
              key={t.value}
              variant={theme === t.value ? "default" : "outline"}
              onClick={() => setTheme(t.value)}
              size="sm"
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <RiCloudLine className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Relay Server</h2>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="relay-hostname" className="text-sm font-medium">
              Hostname
            </Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                id="relay-hostname"
                value={relayHostname}
                onChange={(e) => setRelayHostname(e.target.value)}
                placeholder="r.toolbox.study"
                className="flex-1"
              />
              <Button onClick={handleSaveRelay} variant="secondary">
                Save
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            WebSocket URL: <code className="rounded bg-muted px-1 py-0.5">{relayPreview}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Changes take effect on next sync connection.
          </p>
        </div>
      </div>
    </div>
  );
}
