"use client"

import Link from "next/link"

import { usePortalOrders } from "@/api/portal"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { PORTAL_ORDER_STATUS_LABEL } from "@/domain/status"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

export function PortalOrdersScreen() {
  const { data: orders, isLoading } = usePortalOrders()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My orders</h1>
        <Button nativeButton={false} render={<Link href="/portal/orders/new" />}>Request an order</Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && orders?.length === 0 && <p className="text-muted-foreground text-sm">No orders yet.</p>}

      <div className="space-y-2">
        {orders?.map((order) => (
          <Link
            key={order.id}
            href={`/portal/orders/${order.id}`}
            className="hover:border-primary/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
          >
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <OrderTypeLabel type={order.type} />
            </div>
            <span className="text-muted-foreground text-sm">{PORTAL_ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
