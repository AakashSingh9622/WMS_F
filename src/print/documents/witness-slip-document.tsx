"use client"

import { useOrder, useOrderLines } from "@/api/orders"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/formatting"
import { locationText } from "@/domain/location"
import { requestChannelLabel } from "@/domain/request-channel"
import { loanTypeLabel, loanTypeOf } from "@/domain/loan-type"

/**
 * Witness slips (Docbox "Testigos"): one small slip per box of a dispatch / digitize order. It is left on the shelf in
 * place of the box taken out, so anyone can see where it went and who has it; it is removed when the box comes back.
 */
export function WitnessSlipDocument({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId)
  const { data: lines } = useOrderLines(orderId)

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!order || (order.type !== "dispatch" && order.type !== "digitize"))
    return <p className="text-muted-foreground p-8 text-sm">Witness slips are only for dispatch and digitize orders.</p>

  const boxes = (lines ?? []).filter((l) => l.boxNumber && l.status !== "removed")

  return (
    <div className="mx-auto max-w-[190mm] space-y-4 bg-white p-6 text-sm text-black print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-muted-foreground">{boxes.length} slips for {order.orderNumber}</p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {boxes.map((l) => (
          <article key={l.id} className="space-y-1.5 break-inside-avoid rounded border-2 border-dashed border-black p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-bold tracking-widest uppercase">Witness slip — box out</h2>
              {loanTypeOf(order) && loanTypeOf(order) !== "normal" && <span className="text-xs font-bold uppercase">{loanTypeLabel(loanTypeOf(order))}</span>}
            </div>
            <p className="font-mono text-xl font-semibold">{l.boxNumber}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-black/60">Client</dt>
              <dd className="font-medium">{order.clientName}</dd>
              <dt className="text-black/60">Order</dt>
              <dd className="font-mono">{order.orderNumber}</dd>
              <dt className="text-black/60">Requested by</dt>
              <dd>{order.contactName || order.contactEmail || "—"}</dd>
              {order.requestChannel && (
                <>
                  <dt className="text-black/60">Asked</dt>
                  <dd>{requestChannelLabel(order.requestChannel)}</dd>
                </>
              )}
              <dt className="text-black/60">Taken from</dt>
              <dd>{l.fromLocation ? locationText(l.fromLocation) : "—"}</dd>
              <dt className="text-black/60">Date</dt>
              <dd>{formatDate(new Date().toISOString().slice(0, 10))}</dd>
            </dl>
            <p className="pt-1 text-[10px] text-black/60">Remove this slip when the box is back on the shelf.</p>
          </article>
        ))}
      </div>
    </div>
  )
}
