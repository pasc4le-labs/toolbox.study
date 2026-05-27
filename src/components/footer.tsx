import Link from "next/link";
import { RiHeartFill } from "@remixicon/react";
import { Boxed } from "@/components/boxed";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 transition-colors">
      <Boxed className="py-1 text-center text-xs text-muted-foreground [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-bottom:calc(0.25rem+env(safe-area-inset-bottom))]">
        <p className="inline-flex items-center gap-1 justify-center flex-wrap">
          Licensed under{" "}
          <a
            href="https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
          >
            EUPLv1.2
          </a>
          {" • "}Made with{" "}
          <RiHeartFill className="inline size-3 text-red-500" aria-hidden />{" "}
          by Giuseppe Pascale{" • "}
          <a
            href="https://github.com/giuseppepascale/studytoolbox"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Contribute Now
          </a>
        </p>
      </Boxed>
    </footer>
  );
}
