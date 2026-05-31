import Link from "next/link";
import { RiBookOpenLine, RiExchangeLine, RiMagicLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";

export default function Home() {
  return (
    <Boxed className="py-12 md:py-16">
      {/* Hero section */}
      <div className="relative mb-12 md:mb-16">
        <div className="relative space-y-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              StudyToolbox
            </span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Your local-first study companion. Review flashcards, take exams,
            generate cards with AI — all stored securely in your browser.
          </p>
        </div>
      </div>

      {/* Applet Portals */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/study-dome" className="group">
          <div className="relative h-52 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20">
            {/* Applet content area */}
            <div className="flex h-full flex-col justify-center px-6 py-2">
              {/* Icon and header */}
              <div className="space-y-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/25">
                  <RiBookOpenLine className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Study Dome</h2>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Review cards, take exams, and track your progress with spaced
                    repetition.
                  </p>
                </div>
              </div>
            </div>

            {/* Ambient glow effect */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all duration-300 group-hover:bg-primary/10" />
          </div>
        </Link>

        <Link href="/factory" className="group">
          <div className="relative h-52 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20">
            {/* Applet content area */}
            <div className="flex h-full flex-col justify-center px-6 py-2">
              {/* Icon and header */}
              <div className="space-y-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/25">
                  <RiMagicLine className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Factory</h2>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Generate, import and export flashcards. Supports AI generation
                    and SQT file import.
                  </p>
                </div>
              </div>
            </div>

            {/* Ambient glow effect */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all duration-300 group-hover:bg-primary/10" />
          </div>
        </Link>

        <Link href="/exchange-center" className="group">
          <div className="relative h-52 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20">
            <div className="flex h-full flex-col justify-center px-6 py-2">
              <div className="space-y-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/25">
                  <RiExchangeLine className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Exchange Center</h2>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Share cards, bundles, and exams with peers via direct P2P
                    connection.
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
