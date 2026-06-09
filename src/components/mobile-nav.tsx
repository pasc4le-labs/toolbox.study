"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { RiMenuLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ModeToggle } from "@/components/mode-toggle"
import { Logo } from "@/components/logo"

const navLinks = [
  { label: "Study Dome", href: "/study-dome" },
  { label: "Factory", href: "/factory" },
  { label: "Exchange Center", href: "/exchange-center" },
  { label: "Sync", href: "/settings/syncing" },
  { label: "Settings", href: "/settings" },
] as const

export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()

  const close = React.useCallback(() => setOpen(false), [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open menu"
          className="md:hidden"
        >
          <RiMenuLine />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
        <SheetHeader>
          <SheetTitle>
            <Link
              href="/"
              onClick={close}
              className="flex items-center"
              aria-label="StudyToolbox home"
            >
              <Logo text theme="light" className="h-6 w-auto dark:hidden" />
              <Logo text theme="dark" className="hidden h-6 w-auto dark:block" />
            </Link>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 pt-2">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between border-t p-4">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ModeToggle />
        </div>
      </SheetContent>
    </Sheet>
  )
}
