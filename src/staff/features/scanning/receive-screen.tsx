"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCompleteOrder, usePickList, useReceiveReturnBox } from "@/api/orders"
import { useWarehouses } from "@/api/warehouses"
import { OrderStatusBadge } from "@/components/status-badge"
import { ScanInput, ScanLog, useScanLog } from "@/components/scan-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/**
 * Receiving a collection (spec §6.2 return): scan each box the client sends back — it waits at the chosen warehouse's
 * Goods-In until put away. New boxes on the collection are registered with the Register wizard. "Complete" receives any
 * returning box that wasn't scanned (fixes B7: returned boxes no longer stay "out").
 */
export function ReceiveScreen({ orderId }: { orderId: string }) {
  const { data, isLoading } = usePickList(orderId)
  const { data: warehouses } = useWarehouses()
  const receive = useReceiveReturnBox()
  const complete = useCompleteOrder()
  const log = useScanLog()
  const [warehouseId, setWarehouseId] = useState("")

  if (isLoading || !data) return <Skeleton className="h-96 w-full max-w-4xl" />
  const { order, lines } = data
  const returning = lines.filter((l) => l.lineStatus === "pending" || l.boxStatus === "return_pending" || l.scannedAt)
  const received = returning.filter((l) => l.lineStatus === "received").length
  const inProgress = order.status === "in_progress"
  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id

  async function scan(barcode: string) {
    try {
      const res = await receive.mutateAsync({ orderId, input: { barcode, warehouseId } })
      log.add(
        true,
        `${res.boxNumber} ${res.alreadyReceived ? "was already received" : "received"} — ${res.remaining} still to come`,
      )
    } catch (err) {
      log.add(false, `${barcode}: ${err instanceof Error ? err.message : "not received"}`)
    }
  }

  async function finish() {
    try {
      await complete.mutateAsync({ orderId, input: { warehouseId: warehouseId || undefined } })
      toast.success(`Collection ${order.orderNumber} completed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete the collection")
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">
          Receive{" "}
          <Link href={`/app/orders/${order.id}`} className="text-primary hover:underline">
            {order.orderNumber}
          </Link>
        </h1>
        <OrderStatusBadge status={order.status} />
        {returning.length > 0 && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {received} of {returning.length} returning boxes received
          </span>
        )}
      </div>

      {!inProgress ? (
        <p className="text-muted-foreground text-sm">
          This collection is {order.status.replace(/_/g, " ")} — receiving is only possible while it is in progress.
        </p>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Field>
              <FieldLabel htmlFor="rc-warehouse">Arriving at</FieldLabel>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
                <SelectTrigger id="rc-warehouse">
                  <SelectValue placeholder="Choose the warehouse" getLabel={warehouseName} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {returning.length > 0 ? (
              <ScanInput label="Returning box barcode" disabled={!warehouseId} onScan={scan} />
            ) : (
              <p className="text-muted-foreground text-sm">No boxes are coming back on this collection.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {order.collection && order.collection.expectedNewBoxes > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/app/boxes/new?orderId=${order.id}&clientId=${order.clientId}`} />}
                >
                  Register new boxes ({order.collection.expectedNewBoxes} expected)
                </Button>
              )}
              <Button size="sm" className="ml-auto" disabled={complete.isPending} onClick={finish}>
                {complete.isPending ? "Completing…" : "Complete collection"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Completing receives every returning box that wasn&apos;t scanned
              {warehouseId ? ` into ${warehouseName(warehouseId)} Goods-In` : ""}.
            </p>
          </CardContent>
        </Card>
      )}
      <ScanLog entries={log.entries} />

      {returning.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Boxes coming back</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Box</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returning.map((l) => (
                  <TableRow key={l.lineId}>
                    <TableCell className="font-mono text-xs">{l.barcode ?? l.boxNumber}</TableCell>
                    <TableCell className="max-w-72 truncate">{l.description}</TableCell>
                    <TableCell>
                      <Badge variant={l.lineStatus === "received" ? "secondary" : "outline"}>
                        {l.lineStatus === "received" ? "Received" : "Expected"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
