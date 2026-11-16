"use client"

/* eslint-disable @next/next/no-img-element -- a print page; next/image adds nothing here */
import { useOrder, useOrderBoxes, useOrderLines } from "@/api/orders"
import { useClientProfile } from "@/api/clientProfile"
import { useCustomFields } from "@/api/customFields"
import { useBoxSizeName } from "@/api/settings"
import { DEFAULT_DELIVERY_COLUMNS, deliveryCell, deliveryColumnLabel } from "@/domain/delivery-columns"
import { formatDate, formatDateRange, formatDateTime } from "@/lib/formatting"
import { Button } from "@/components/ui/button"

/** Delivery note for a dispatch order (spec §6.2): goes with the boxes; the recipient signs it as proof of delivery. */
export function DeliveryNoteDocument({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId)
  const { data: lines } = useOrderLines(orderId)
  const { data: orderBoxes } = useOrderBoxes(orderId)
  const { data: profile } = useClientProfile(order?.clientId ?? "")
  const { data: fields = [] } = useCustomFields(order?.clientId ?? "", { includeInactive: true })
  const sizeName = useBoxSizeName()

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!order || order.type !== "dispatch")
    return <p className="text-muted-foreground p-8 text-sm">A delivery note is only for a dispatch order.</p>

  const boxes = (lines ?? []).filter((l) => l.boxNumber && l.status !== "removed" && l.status !== "missing")
  const d = order.delivery
  // The columns this client chose for its delivery note (Settings → client → Delivery note columns), else just the description.
  const columns = (profile?.deliveryColumns.length ? profile.deliveryColumns : DEFAULT_DELIVERY_COLUMNS).filter(
    (k) => !/^Cd+$/.test(k) || fields.some((f) => f.code === k && f.active)
  )
  const boxById = new Map((orderBoxes ?? []).map((b) => [b.id, b]))
  const cellText = (boxId: string | undefined, key: string) => {
    const box = boxId ? boxById.get(boxId) : undefined
    if (!box) return ""
    if (key === "filingDates") return formatDateRange(box.filingDateFrom, box.filingDateTo)
    const def = fields.find((f) => f.code === key)
    if (def?.fieldType === "date" && box.customFields?.[key]) return formatDate(String(box.customFields[key]))
    return deliveryCell(box, key, sizeName)
  }

  return (
    <div className="mx-auto max-w-[190mm] space-y-6 bg-white p-8 text-sm text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <header className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          <img src="/login/logo.png" alt="DocuSoft" className="h-12 w-auto" />
          <h1 className="mt-3 text-2xl font-semibold">Delivery Note</h1>
        </div>
        <dl className="text-right text-xs">
          <dt className="text-black/60">Order</dt>
          <dd className="font-mono text-base font-semibold">{order.orderNumber}</dd>
          {d?.dispatchedAt && (
            <>
              <dt className="mt-2 text-black/60">Dispatched</dt>
              <dd>{formatDateTime(d.dispatchedAt)}</dd>
            </>
          )}
        </dl>
      </header>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-xs text-black/60">Deliver to</h2>
          <p className="font-semibold">{order.clientName}</p>
          {order.contactName && <p>{order.contactName}</p>}
          {order.address && <p className="whitespace-pre-line">{order.address}</p>}
          {order.contactPhone && <p>{order.contactPhone}</p>}
        </div>
        <dl className="space-y-1">
          {d?.recipientName && (
            <div>
              <dt className="text-xs text-black/60">Handed to</dt>
              <dd>{d.recipientName}</dd>
            </div>
          )}
          {d?.courier && (
            <div>
              <dt className="text-xs text-black/60">Courier</dt>
              <dd>
                {d.courier}
                {d.trackingRef ? ` — ${d.trackingRef}` : ""}
              </dd>
            </div>
          )}
          {order.permanentWithdrawal && (
            <p className="font-semibold">Permanent withdrawal — these boxes are returned to the client for good.</p>
          )}
        </dl>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Boxes ({boxes.length})</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="w-10 py-1 pr-2">#</th>
              <th className="py-1 pr-2">Box</th>
              {columns.map((k) => (
                <th key={k} className="py-1 pr-2">
                  {deliveryColumnLabel(k, fields)}
                </th>
              ))}
              <th className="py-1">Received ✓</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((l, i) => (
              <tr key={l.id} className="border-b border-black/10 break-inside-avoid">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2 font-mono">{l.boxNumber}</td>
                {columns.map((k) => (
                  <td key={k} className="py-1.5 pr-2">
                    {cellText(l.boxId, k)}
                  </td>
                ))}
                <td className="py-1.5">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {order.notes && (
        <p>
          <span className="text-xs text-black/60">Notes: </span>
          {order.notes}
        </p>
      )}

      <footer className="grid grid-cols-3 gap-8 pt-10">
        <div className="border-t pt-1 text-xs text-black/60">Received by (name)</div>
        <div className="border-t pt-1 text-xs text-black/60">Signature</div>
        <div className="border-t pt-1 text-xs text-black/60">Date &amp; time</div>
      </footer>
    </div>
  )
}
