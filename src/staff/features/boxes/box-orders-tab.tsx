"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"

import { useBoxOrders } from "@/api/boxes"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { OrderStatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"

export function BoxOrdersTab({ boxId }: { boxId: string }) {
  const { data: orders, isLoading } = useBoxOrders(boxId)

  if (isLoading) return <Skeleton className="h-32 w-full max-w-xl" />
  if (!orders || orders.length === 0) {
    return <p className="text-muted-foreground text-sm">This box hasn&apos;t been on any orders yet.</p>
  }

  return (
    <div className="max-w-xl space-y-2">
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/app/orders/${order.id}`}
          className="hover:border-primary/50 flex items-center justify-between rounded-md border p-3 text-sm transition-colors"
        >
          <div className="space-y-0.5">
            <p className="font-medium">{order.orderNumber}</p>
            <OrderTypeLabel type={order.type} />
          </div>
          <div className="text-right">
            <OrderStatusBadge status={order.status} />
            <p className="text-muted-foreground mt-1 text-xs">
              {formatDate(order.completedAt ?? order.scheduledFor ?? order.createdAt)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
