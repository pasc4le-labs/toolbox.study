import type { Metadata } from "next";
import Link from "next/link";
import { RiUploadLine, RiDownloadLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";

export const metadata: Metadata = {
  title: "Exchange Center",
};

export default function ExchangeCenterPage() {
  return (
    <Boxed className="py-8 md:py-12">
      <div className="mb-8 space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Exchange Center
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Share cards, bundles, and exams with peers via direct P2P connection.
          Your data transfers directly between browsers — nothing passes through
          our servers.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/exchange-center/offer" className="group">
          <div className="relative h-44 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20">
            <div className="flex h-full flex-col justify-center px-6 py-2">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/25">
                  <RiUploadLine className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Offer Items</h2>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Select cards, bundles, or exams to share. Get a room code for
                    your peer to connect.
                  </p>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all duration-300 group-hover:bg-primary/10" />
          </div>
        </Link>

        <Link href="/exchange-center/receive" className="group">
          <div className="relative h-44 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20">
            <div className="flex h-full flex-col justify-center px-6 py-2">
              <div className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/25">
                  <RiDownloadLine className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Receive Items</h2>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Enter a room code to connect to a peer and selectively import
                    study items.
                  </p>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all duration-300 group-hover:bg-primary/10" />
          </div>
        </Link>
      </div>
    </Boxed>
  );
}
