"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export interface TabNavItem {
  href: string
  label: string
}

export function TabNav({ items }: { items: TabNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="bg-muted inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl p-1">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
