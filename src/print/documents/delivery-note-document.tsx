"use client"

/* eslint-disable @next/next/no-img-element -- a print page; next/image adds nothing here */
import { useOrder, useOrderBoxes, useOrderLines } from "@/api/orders"
import { useClientProfile } from "@/api/clientProfile"
import { useCustomFields } from "@/api/customFields"
import { useExpedientes } from "@/api/expedientes"
import { useBoxSizeName } from "@/api/settings"
import { DEFAULT_DELIVERY_COLUMNS, deliveryCell, deliveryColumnLabel } from "@/domain/delivery-columns"
import { isGrouped, isLandscape, showsCode } from "@/domain/delivery-format"
import { formatDate, formatDateRange, formatDateTime } from "@/lib/formatting"
import { Button } from "@/components/ui/button"

/**
 * Delivery note for a dispatch order (spec §6.2): goes with the boxes; the recipient signs it as proof of delivery.
 * Each expediente of the client (Docbox "Expedientes - Clientes") has its own template (Formato) and its own order of
 * fields (Ordenación); boxes of different expedientes are listed in a table each. Without an expediente setting the
 * note uses the client's own columns.
 */
export function DeliveryNoteDocument({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId)
  const { data: lines } = useOrderLines(orderId)
  const { data: orderBoxes } = useOrderBoxes(orderId)
  const { data: profile } = useClientProfile(order?.clientId ?? "")
  const { data: fields = [] } = useCustomFields(order?.clientId ?? "", { includeInactive: true })
  const { data: expedientes = [] } = useExpedientes(order?.clientId ?? "")
  const sizeName = useBoxSizeName()

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!order || order.type !== "dispatch")
    return <p className="text-muted-foreground p-8 text-sm">A delivery note is only for a dispatch order.</p>

  const boxes = (lines ?? []).filter((l) => l.boxNumber && l.status !== "removed" && l.status !== "missing")
  const d = order.delivery
  const usable = (keys: string[]) => keys.filter((k) => !/^C\d+$/.test(k) || fields.some((f) => f.code === k && f.active))
  // The client's own choice (Clients → delivery note columns), else just the description.
  const clientColumns = usable(profile?.deliveryColumns.length ? profile.deliveryColumns : DEFAULT_DELIVERY_COLUMNS)
  const boxById = new Map((orderBoxes ?? []).map((b) => [b.id, b]))
  const cellText = (boxId: string | undefined, key: string) => {
    const box = boxId ? boxById.get(boxId) : undefined
    if (!box) return ""
    if (key === "filingDates") return formatDateRange(box.filingDateFrom, box.filingDateTo)
    const def = fields.find((f) => f.code === key)
    if (def?.fieldType === "date" && box.customFields?.[key]) return formatDate(String(box.customFields[key]))
    return deliveryCell(box, key, sizeName)
  }

  // One table per expediente (in the order they first appear); boxes without an expediente form their own.
  const groupKeys: string[] = []
  const byGroup = new Map<string, typeof boxes>()
  for (const l of boxes) {
    const key = (l.boxId ? boxById.get(l.boxId)?.expedienteId : undefined) ?? ""
    if (!byGroup.has(key)) {
      byGroup.set(key, [])
      groupKeys.push(key)
    }
    byGroup.get(key)!.push(l)
  }
  const groups = groupKeys.map((key) => {
    const expediente = expedientes.find((e) => e.id === key)
    const own = expediente ? usable(expediente.deliveryColumns) : []
    return { key, expediente, format: expediente?.format ?? "Albaran", columns: own.length ? own : clientColumns, rows: byGroup.get(key) ?? [] }
  })
  const landscape = groups.some((g) => isLandscape(g.format))
  let counter = 0

  return (
    <div className={`mx-auto space-y-6 bg-white p-8 text-sm text-black print:p-0 ${landscape ? "max-w-[277mm]" : "max-w-[190mm]"}`}>
      {landscape && <style>{"@page { size: A4 landscape; }"}</style>}
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

      <section className="space-y-5">
        <h2 className="font-semibold">Boxes ({boxes.length})</h2>
        {groups.map((g) => {
          const grouped = isGrouped(g.format) && g.columns.length > 0
          // Akte: lines are listed under the value of the first field, which then isn't repeated on each line
          const headKey = grouped ? g.columns[0] : undefined
          const shownColumns = grouped ? g.columns.slice(1) : g.columns
          const rows = headKey ? [...g.rows].sort((a, b) => cellText(a.boxId, headKey).localeCompare(cellText(b.boxId, headKey))) : g.rows
          let lastHead: string | undefined
          return (
            <div key={g.key || "none"} className="space-y-1">
              {(groups.length > 1 || g.expediente) && (
                <h3 className="text-xs font-semibold text-black/70">
                  {g.expediente ? `File ${g.expediente.code} — ${g.expediente.description}` : "Other boxes"}
                </h3>
              )}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-10 py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Box</th>
                    {showsCode(g.format) && <th className="py-1 pr-2">Code</th>}
                    {shownColumns.map((k) => (
                      <th key={k} className="py-1 pr-2">
                        {deliveryColumnLabel(k, fields)}
                      </th>
                    ))}
                    <th className="py-1">Received ✓</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    counter += 1
                    const head = headKey ? cellText(l.boxId, headKey) : undefined
                    const showHead = headKey !== undefined && head !== lastHead
                    lastHead = head
                    const colSpan = 3 + shownColumns.length + (showsCode(g.format) ? 1 : 0)
                    return [
                      showHead && (
                        <tr key={`${l.id}-head`} className="break-inside-avoid bg-black/5">
                          <td colSpan={colSpan} className="py-1 pr-2 font-semibold">
                            {deliveryColumnLabel(headKey!, fields)}: {head || "—"}
                          </td>
                        </tr>
                      ),
                      <tr key={l.id} className="border-b border-black/10 break-inside-avoid">
                        <td className="py-1.5 pr-2">{counter}</td>
                        <td className="py-1.5 pr-2 font-mono">{l.boxNumber}</td>
                        {showsCode(g.format) && <td className="py-1.5 pr-2 font-mono">{(l.boxId && boxById.get(l.boxId)?.barcode) || l.boxNumber}</td>}
                        {shownColumns.map((k) => (
                          <td key={k} className="py-1.5 pr-2">
                            {cellText(l.boxId, k)}
                          </td>
                        ))}
                        <td className="py-1.5">☐</td>
                      </tr>,
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
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
