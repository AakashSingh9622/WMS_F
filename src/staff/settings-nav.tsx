"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { TabNavItem } from "@/components/tab-nav"

export function SettingsNav({ items }: { items: TabNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="bg-card flex w-52 shrink-0 flex-col gap-1 self-start rounded-2xl border p-2 shadow-xs">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-[#b93c2e]/10 text-[#b93c2e]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
