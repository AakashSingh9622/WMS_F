"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { Package } from "@/components/icons"

import { portalNavItems } from "@/domain/navigation"
import { UserMenu } from "@/components/user-menu"
import { cn } from "@/lib/utils"

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="side-portal flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-8">
            <Link href="/portal" className="flex items-center gap-2 font-semibold">
              <Package className="text-primary size-5" />
              WMS Portal
            </Link>
            <nav className="flex items-center gap-1">
              {portalNavItems.map((item) => {
                const isActive =
                  item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
