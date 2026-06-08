"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RiSettings3Line, RiDatabase2Line, RiPaintBrushLine, RiLoopLeftLine, RiInformationLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SettingsProvider } from "./_components/settings-provider";
import { GeneralTab } from "./_components/general-tab";
import { PreferencesTab } from "./_components/preferences-tab";
import { SyncingTab } from "./_components/syncing-tab";
import { AboutTab } from "./_components/about-tab";

const TAB_MAP: Record<string, string> = {
  general: "general",
  preferences: "preferences",
  syncing: "syncing",
  about: "about",
};

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab = tabParam && TAB_MAP[tabParam] ? TAB_MAP[tabParam] : "general";

  return (
    <SettingsProvider>
      <Boxed className="py-8 md:py-12">
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <RiSettings3Line className="h-6 w-6 text-primary" />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Settings
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage your database, preferences, device sync, and app information.
          </p>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="general">
              <RiDatabase2Line className="mr-2 h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <RiPaintBrushLine className="mr-2 h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="syncing">
              <RiLoopLeftLine className="mr-2 h-4 w-4" />
              Syncing
            </TabsTrigger>
            <TabsTrigger value="about">
              <RiInformationLine className="mr-2 h-4 w-4" />
              About
            </TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="general">
              <GeneralTab />
            </TabsContent>
            <TabsContent value="preferences">
              <PreferencesTab />
            </TabsContent>
            <TabsContent value="syncing">
              <SyncingTab />
            </TabsContent>
            <TabsContent value="about">
              <AboutTab />
            </TabsContent>
          </div>
        </Tabs>
      </Boxed>
    </SettingsProvider>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
