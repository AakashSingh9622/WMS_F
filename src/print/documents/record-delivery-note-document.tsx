"use client"

import { useCustomFields } from "@/api/customFields"
import { lineLocation, useRecordRequest } from "@/api/recordRequests"
import { Button } from "@/components/ui/button"
import { locationText } from "@/domain/location"
import { loanTypeLabel } from "@/domain/loan-type"
import { requestChannelLabel } from "@/domain/request-channel"
import { formatDate, formatDateTime } from "@/lib/formatting"

/**
 * Delivery note for a request for records (Docbox "Albarán de entrega"): lists the records going to the client, with the
 * client's own fields, and the recipient signs it. Draws on the same data as the request's detail page.
 */
export function RecordDeliveryNoteDocument({ requestId }: { requestId: string }) {
  const { data: request, isLoading } = useRecordRequest(requestId)
  const { data: fields = [] } = useCustomFields(request?.clientId ?? "", { includeInactive: true })

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!request) return <p className="text-muted-foreground p-8 text-sm">This request was not found.</p>

  const lines = request.lines ?? []
  // the columns: the client's own fields that at least one of these records has a value for
  const columns = fields.filter((f) => f.active && lines.some((l) => l.fields?.[f.code] !== undefined && l.fields[f.code] !== ""))

  return (
    <div className="mx-auto max-w-[190mm] space-y-6 bg-white p-6 text-sm text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <header className="flex items-start justify-between border-b pb-3">
        <div>
          <h1 className="text-lg font-bold tracking-wide uppercase">Delivery note — records</h1>
          <p className="text-black/60">{request.clientName}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold">{request.requestNumber}</p>
          <p className="text-xs text-black/60">{formatDate(new Date().toISOString().slice(0, 10))}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-1">
        <div className="flex gap-2">
          <dt className="text-black/60">Requested by</dt>
          <dd className="font-medium">{[request.contactName, request.contactEmail].filter(Boolean).join(" — ") || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/60">Requested on</dt>
          <dd className="font-medium">{formatDateTime(request.createdAt)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/60">Loan type</dt>
          <dd className="font-medium">{loanTypeLabel(request.loanType) ?? request.loanType}</dd>
        </div>
        {request.requestChannel && (
          <div className="flex gap-2">
            <dt className="text-black/60">Asked</dt>
            <dd className="font-medium">{requestChannelLabel(request.requestChannel)}</dd>
          </div>
        )}
      </dl>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Internal code</th>
            {columns.map((f) => (
              <th key={f.code} className="py-1 pr-2">
                {f.name}
              </th>
            ))}
            <th className="py-1 pr-2">Box</th>
            <th className="py-1 pr-2">Location</th>
            <th className="py-1">Received</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-black/10 break-inside-avoid">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 font-mono">{l.internalCode}</td>
              {columns.map((f) => (
                <td key={f.code} className="py-1.5 pr-2">
                  {l.fields?.[f.code] ?? ""}
                </td>
              ))}
              <td className="py-1.5 pr-2 font-mono">{l.boxNumber}</td>
              <td className="py-1.5 pr-2">{lineLocation(l) ? locationText(lineLocation(l)) : ""}</td>
              <td className="py-1.5">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-black/60">
        {lines.length} record{lines.length === 1 ? "" : "s"}
      </p>

      {request.notes && (
        <p>
          <span className="text-xs text-black/60">Notes: </span>
          {request.notes}
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
