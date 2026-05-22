import Link from "next/link";
import { Boxed } from "@/components/boxed";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
      <Boxed className="flex h-14 items-center">
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
      </Boxed>
    </header>
  );
}
