import Link from "next/link";
import { RiSettings3Line } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { MobileNav } from "@/components/mobile-nav";
import { Logo } from "@/components/logo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-background/40">
      <Boxed className="flex h-14 items-center justify-between [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-top:calc(0.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link href="/" className="flex items-center" aria-label="StudyToolbox home">
            <span className="md:hidden">
              <Logo text={false} theme="light" className="block h-6 w-auto dark:hidden" />
              <Logo text={false} theme="dark" className="hidden h-6 w-auto dark:block" />
            </span>
            <span className="hidden md:block">
              <Logo text theme="light" className="h-6 w-auto dark:hidden" />
              <Logo text theme="dark" className="hidden h-6 w-auto dark:block" />
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2 md:gap-6">
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link
              href="/study-dome"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Study Dome
            </Link>
            <Link
              href="/factory"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Factory
            </Link>
            <Link
              href="/exchange-center"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Exchange Center
            </Link>
            <Link
              href="/settings"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Settings"
            >
              <RiSettings3Line className="h-5 w-5" />
            </Link>
          </nav>
        </div>
      </Boxed>
    </header>
  );
}
