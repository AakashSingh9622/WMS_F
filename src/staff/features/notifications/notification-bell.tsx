"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useStaffNotifications,
  useUnreadNotificationCount,
  type StaffNotification,
} from "@/api/notifications"
import { Bell } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"

const linkOf = (n: StaffNotification) => (n.orderId ? `/app/orders/${n.orderId}` : "/app")

/**
 * The bell in the staff top bar: unread count, the latest notifications (what clients did in the portal), opening one
 * marks it read and goes to its order. New ones that arrive while the app is open also pop up as a toast.
 */
export function NotificationBell() {
  const router = useRouter()
  const { data: unread = 0 } = useUnreadNotificationCount()
  const { data } = useStaffNotifications(15)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  // Toast only what arrived after the first load (not the backlog on every page open).
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!data) return
    if (!known.current) {
      known.current = new Set(data.items.map((n) => n.id))
      return
    }
    const fresh = data.items.filter((n) => !n.read && !known.current!.has(n.id))
    for (const n of data.items) known.current.add(n.id)
    for (const n of fresh.slice(0, 3)) {
      toast(n.title, {
        description: n.body,
        action: {
          label: "Open",
          onClick: () => {
            markRead.mutate(n.id)
            router.push(linkOf(n))
          },
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new data only
  }, [data])

  function open(n: StaffNotification) {
    if (!n.read) markRead.mutate(n.id)
    router.push(linkOf(n))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-[#b93c2e] px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
            {unread > 0 && (
              <button
                type="button"
                className="text-primary text-xs hover:underline"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all as read
              </button>
            )}
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-96 overflow-y-auto">
          {!data?.items.length ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              Nothing yet — client actions show here.
            </p>
          ) : (
            data.items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => open(n)}
                className={cn("items-start gap-2.5 rounded-none px-3 py-2.5", !n.read && "bg-[#b93c2e]/[0.04]")}
              >
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-[#b93c2e]")}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !n.read && "font-semibold")}>{n.title}</span>
                  {n.body && <span className="text-muted-foreground block truncate text-xs">{n.body}</span>}
                  <span className="text-muted-foreground block text-xs">{formatRelativeTime(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
