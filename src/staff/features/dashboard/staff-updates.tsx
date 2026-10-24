"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { useStaffNotifications } from "@/api/notifications"
import { formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

const SEEN_KEY = "wms.staffUpdatesSeenAt"

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ""
  } catch {
    return ""
  }
}

/**
 * In-app updates for staff (no email yet): new portal requests, client approvals, … Items newer than the last visit are
 * marked; opening the dashboard counts as seeing them (kept per browser).
 */
export function StaffUpdates() {
  const { data, isLoading } = useStaffNotifications(8)
  // The previous visit, read once on mount (the list itself only loads in the browser, so SSR never shows "new").
  const [seenAt] = useState(() => (typeof window === "undefined" ? null : readSeen()))

  // Mark everything shown as seen for next time.
  useEffect(() => {
    const newest = data?.items[0]?.createdAt
    if (newest)
      try {
        localStorage.setItem(SEEN_KEY, newest)
      } catch {
        // storage blocked — every update just looks "seen"
      }
  }, [data])

  return (
    <section aria-labelledby="updates" className="space-y-3">
      <h2 id="updates" className="text-sm font-semibold">
        Updates
      </h2>
      <div className="bg-card rounded-2xl border">
        {isLoading ? (
          <Skeleton className="m-4 h-24" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-4 text-sm">Nothing new from clients.</p>
        ) : (
          <ul className="divide-y">
            {data.items.map((n) => {
              const isNew = seenAt !== null && n.createdAt > seenAt
              const body = (
                <>
                  <p className={cn("text-sm", isNew && "font-semibold")}>
                    {isNew && <span className="bg-primary mr-2 inline-block size-2 rounded-full align-middle" />}
                    {n.title}
                  </p>
                  {n.body && <p className="text-muted-foreground text-xs">{n.body}</p>}
                  <p className="text-muted-foreground text-[11px]">{formatRelativeTime(n.createdAt)}</p>
                </>
              )
              return (
                <li key={n.id}>
                  {n.orderId ? (
                    <Link href={`/app/orders/${n.orderId}`} className="hover:bg-muted/50 block px-4 py-2.5">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-4 py-2.5">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
