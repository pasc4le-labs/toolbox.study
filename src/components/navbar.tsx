import Link from "next/link";
import { Boxed } from "@/components/boxed";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-background/40">
      <Boxed className="flex h-14 items-center justify-between [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-top:calc(0.5rem+env(safe-area-inset-top))]">
        <Link href="/" className="flex items-center">
          <img
            src="/logo.svg"
            alt="StudyToolbox"
            className="block h-6 w-auto md:hidden"
          />
          <img
            src="/logo-text.svg"
            alt="StudyToolbox"
            className="hidden h-6 w-auto md:block"
          />
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
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
        </nav>
      </Boxed>
    </header>
  );
}
