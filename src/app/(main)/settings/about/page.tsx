"use client";

import { RiSettings3Line, RiInformationLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { AboutTab } from "../_components/about-tab";

export default function SettingsAboutPage() {
  return (
    <Boxed className="py-8 md:py-12">
      <div className="mb-8 space-y-3">
        <div className="flex items-center gap-2">
          <RiSettings3Line className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            About
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          App information, links, and resources.
        </p>
      </div>
      <AboutTab />
    </Boxed>
  );
}
