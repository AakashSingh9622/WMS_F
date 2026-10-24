"use client"

import { usePathname } from "next/navigation"

import { TabNav } from "@/components/tab-nav"

const TABS = [
  { href: "/app/billing", label: "Invoices" },
  { href: "/app/billing/charges", label: "Charges" },
  { href: "/app/billing/runs", label: "Billing runs" },
  { href: "/app/billing/rate-cards", label: "Rate cards" },
]

/** Billing's tabs — only on the four list pages, not on an invoice / run detail or the new-invoice form. */
export function BillingTabs() {
  const pathname = usePathname()
  if (!TABS.some((t) => t.href === pathname)) return null
  return <TabNav items={TABS} />
}
