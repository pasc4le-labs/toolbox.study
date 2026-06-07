"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Boxed } from "@/components/boxed";

const tabs = [
  { label: "Overview", href: "/exchange-center" },
  { label: "Offer", href: "/exchange-center/offer" },
  { label: "Receive", href: "/exchange-center/receive" },
];

export function ExchangeCenterNav() {
  const pathname = usePathname();

  return (
    <div className="border-b">
      <Boxed>
        <nav className="no-scrollbar -mx-1 flex gap-6 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                pathname === tab.href || (tab.href !== "/exchange-center" && pathname.startsWith(tab.href))
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </Boxed>
    </div>
  );
}
