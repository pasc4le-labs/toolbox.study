import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <Link href="/" className="flex items-center">
          <img
            src="/logo.svg"
            alt="StudyToolbox"
            className="block h-8 w-auto md:hidden"
          />
          <img
            src="/logo-text.svg"
            alt="StudyToolbox"
            className="hidden h-8 w-auto md:block"
          />
        </Link>
      </div>
    </header>
  );
}
