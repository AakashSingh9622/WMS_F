"use client"

import Link from "next/link"

import { useMarkNotificationRead, useStaffNotifications } from "@/api/notifications"
import { formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * In-app updates for staff (no email yet): what clients did in the portal. Unread ones (per staff member, the same as
 * the bell in the top bar) are marked; opening one marks it read.
 */
export function StaffUpdates() {
  const { data, isLoading } = useStaffNotifications(8)
  const markRead = useMarkNotificationRead()

  return (
    <section aria-labelledby="updates" className="space-y-3">
      <h2 id="updates" className="flex items-baseline gap-2 text-sm font-semibold">
        Updates
        {!!data?.unread && <span className="text-xs font-normal text-[#b93c2e]">{data.unread} unread</span>}
      </h2>
      <div className="bg-card rounded-2xl border">
        {isLoading ? (
          <Skeleton className="m-4 h-24" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-4 text-sm">Nothing new from clients.</p>
        ) : (
          <ul className="divide-y">
            {data.items.map((n) => {
              const body = (
                <>
                  <p className={cn("text-sm", !n.read && "font-semibold")}>
                    {!n.read && <span className="mr-2 inline-block size-2 rounded-full bg-[#b93c2e] align-middle" />}
                    {n.title}
                  </p>
                  {n.body && <p className="text-muted-foreground text-xs">{n.body}</p>}
                  <p className="text-muted-foreground text-[11px]">{formatRelativeTime(n.createdAt)}</p>
                </>
              )
              const read = () => !n.read && markRead.mutate(n.id)
              return (
                <li key={n.id}>
                  {n.orderId ? (
                    <Link
                      href={`/app/orders/${n.orderId}`}
                      onClick={read}
                      className="hover:bg-muted/50 block px-4 py-2.5"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={read}
                      className="hover:bg-muted/50 block w-full px-4 py-2.5 text-left"
                    >
                      {body}
                    </button>
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
