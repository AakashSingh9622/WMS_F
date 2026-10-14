"use client"

import Link from "next/link"

import { usePortalSummary } from "@/api/portal"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { PORTAL_BOX_STATUS_LABEL } from "@/domain/status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function PortalDashboardScreen() {
  const { data, isLoading } = usePortalSummary()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const byPlainStatus = Object.entries(data.boxesByStatus).reduce<Record<string, number>>((acc, [status, count]) => {
    const label = PORTAL_BOX_STATUS_LABEL[status as keyof typeof PORTAL_BOX_STATUS_LABEL] ?? status
    acc[label] = (acc[label] ?? 0) + count
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Welcome back{data.client ? `, ${data.client.name}` : ""}</h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your archive.</p>
      </div>

      {data.needsAuthorisation.length > 0 && (
        <Card className="border-status-pending-destruction/40">
          <CardContent className="flex items-center justify-between pt-6">
            <p className="text-sm">
              {data.needsAuthorisation.length} destruction order{data.needsAuthorisation.length > 1 ? "s are" : " is"}{" "}
              waiting for your authorisation.
            </p>
            <Button nativeButton={false} size="sm" render={<Link href="/portal/orders" />}>
              Review
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">Total boxes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{data.boxCount}</CardContent>
        </Card>
        {Object.entries(byPlainStatus).map(([label, count]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{count}</CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Open orders</h2>
        {data.openOrders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open orders.</p>
        ) : (
          <div className="space-y-2">
            {data.openOrders.map((order) => (
              <Link
                key={order.id}
                href={`/portal/orders/${order.id}`}
                className="hover:border-primary/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
              >
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <OrderTypeLabel type={order.type} />
                </div>
                <span className="text-muted-foreground text-sm">{order.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
