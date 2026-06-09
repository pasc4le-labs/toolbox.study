"use client";

import { RiSettings3Line, RiDatabase2Line } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { SettingsProvider } from "./_components/settings-provider";
import { GeneralTab } from "./_components/general-tab";

export default function SettingsGeneralPage() {
  return (
    <SettingsProvider>
      <Boxed className="py-8 md:py-12">
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <RiSettings3Line className="h-6 w-6 text-primary" />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              General
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Database statistics and maintenance.
          </p>
        </div>
        <GeneralTab />
      </Boxed>
    </SettingsProvider>
  );
}
