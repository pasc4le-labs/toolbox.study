import Link from "next/link";
import { RiHeartFill } from "@remixicon/react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link
            href="/tos"
            className="transition-colors hover:text-foreground"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} StudyToolbox. Licensed under{" "}
            <a
              href="https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              EUPLv1.2
            </a>
            .
          </p>
          <p className="inline-flex items-center gap-1">
            Made with{" "}
            <RiHeartFill className="inline size-4 text-red-500" aria-hidden />{" "}
            by Giuseppe Pascale.{" "}
            <a
              href="https://github.com/giuseppepascale/studytoolbox"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Contribute Now
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
