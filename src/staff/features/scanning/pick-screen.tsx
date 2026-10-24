"use client"

import Link from "next/link"

import { usePickBox, usePickList } from "@/api/orders"
import { OrderStatusBadge } from "@/components/status-badge"
import { ScanInput, ScanLog, useScanLog } from "@/components/scan-input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderActions } from "@/staff/features/orders/order-actions"

/**
 * Picking a dispatch / destruction order (spec §6.2): the boxes in walking order, scan each one off the shelf. A box
 * that isn't on the order is refused (and queued for a supervisor). When every box is picked the order is "ready" and
 * the usual Dispatch / Mark destroyed button finishes it.
 */
export function PickScreen({ orderId }: { orderId: string }) {
  const { data, isLoading } = usePickList(orderId)
  const pick = usePickBox()
  const log = useScanLog()

  if (isLoading || !data) return <Skeleton className="h-96 w-full max-w-4xl" />
  const { order, lines } = data
  const active = lines.filter((l) => l.lineStatus !== "missing")
  const picked = active.filter((l) => l.lineStatus !== "pending").length
  const canScan = (order.status === "in_progress" || order.status === "ready") && picked < active.length

  async function scan(barcode: string) {
    try {
      const res = await pick.mutateAsync({ orderId, input: { barcode } })
      log.add(true, `${res.boxNumber} ${res.alreadyPicked ? "was already picked" : "picked"} — ${res.remaining} to go`)
    } catch (err) {
      log.add(false, `${barcode}: ${err instanceof Error ? err.message : "not picked"}`)
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">
          Pick{" "}
          <Link href={`/app/orders/${order.id}`} className="text-primary hover:underline">
            {order.orderNumber}
          </Link>
        </h1>
        <OrderStatusBadge status={order.status} />
        <span className="text-muted-foreground text-sm tabular-nums">
          {picked} of {active.length} picked
        </span>
      </div>

      {canScan ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">Scan each box as you take it off the shelf</p>
            <ScanInput label="Box barcode" onScan={scan} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          {order.status === "ready"
            ? "Every box is picked — finish the order below."
            : `This order is ${order.status.replace(/_/g, " ")} — picking is only possible while it is in progress.`}
        </p>
      )}
      <ScanLog entries={log.entries} />
      <OrderActions order={order} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pick list — in walking order</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Slot label</TableHead>
                <TableHead>Box</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={l.lineId} className={l.lineStatus === "pending" ? "" : "text-muted-foreground"}>
                  <TableCell className="tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    {l.location ? `${l.location.warehouse} › ${l.location.rack} › ${l.location.slot}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.slotBarcode ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.barcode ?? l.boxNumber}</TableCell>
                  <TableCell className="max-w-56 truncate">{l.description}</TableCell>
                  <TableCell>
                    <Badge variant={l.lineStatus === "pending" ? "outline" : "secondary"}>
                      {l.lineStatus === "pending" ? "To pick" : l.lineStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
