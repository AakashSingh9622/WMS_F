"use client"

import { useCustomFields } from "@/api/customFields"
import { lineLocation, useRecordRequest } from "@/api/recordRequests"
import { Button } from "@/components/ui/button"
import { locationText } from "@/domain/location"
import { loanTypeLabel } from "@/domain/loan-type"
import { requestChannelLabel } from "@/domain/request-channel"
import { formatDate } from "@/lib/formatting"

/**
 * Witness slips for a request for records (Docbox "Testigos"): one small slip per record. It is left in the box in place
 * of the record taken out, so anyone can see where it went and who has it; it is removed when the record comes back.
 */
export function RecordWitnessSlipsDocument({ requestId }: { requestId: string }) {
  const { data: request, isLoading } = useRecordRequest(requestId)
  const { data: fields = [] } = useCustomFields(request?.clientId ?? "", { includeInactive: true })

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!request) return <p className="text-muted-foreground p-8 text-sm">This request was not found.</p>

  const lines = request.lines ?? []
  const named = fields.filter((f) => f.active).slice(0, 3)

  return (
    <div className="mx-auto max-w-[190mm] space-y-4 bg-white p-6 text-sm text-black print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-muted-foreground">
          {lines.length} slip{lines.length === 1 ? "" : "s"} for {request.requestNumber}
        </p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {lines.map((l) => (
          <article key={l.id} className="space-y-1.5 break-inside-avoid rounded border-2 border-dashed border-black p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-bold tracking-widest uppercase">Witness slip — record out</h2>
              {request.loanType !== "normal" && <span className="text-xs font-bold uppercase">{loanTypeLabel(request.loanType) ?? request.loanType}</span>}
            </div>
            <p className="font-mono text-xl font-semibold">{l.internalCode}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-black/60">Client</dt>
              <dd className="font-medium">{request.clientName}</dd>
              {named.map((f) =>
                l.fields?.[f.code] !== undefined && l.fields[f.code] !== "" ? (
                  <div key={f.code} className="contents">
                    <dt className="text-black/60">{f.name}</dt>
                    <dd>{l.fields[f.code]}</dd>
                  </div>
                ) : null,
              )}
              <dt className="text-black/60">Request</dt>
              <dd className="font-mono">{request.requestNumber}</dd>
              <dt className="text-black/60">Requested by</dt>
              <dd>{request.contactName || request.contactEmail || "—"}</dd>
              {request.requestChannel && (
                <>
                  <dt className="text-black/60">Asked</dt>
                  <dd>{requestChannelLabel(request.requestChannel)}</dd>
                </>
              )}
              <dt className="text-black/60">Taken from</dt>
              <dd>
                <span className="font-mono">{l.boxNumber}</span>
                {lineLocation(l) ? ` — ${locationText(lineLocation(l))}` : ""}
              </dd>
              <dt className="text-black/60">Date</dt>
              <dd>{formatDate(new Date().toISOString().slice(0, 10))}</dd>
            </dl>
            <p className="pt-1 text-[10px] text-black/60">Remove this slip when the record is back in its box.</p>
          </article>
        ))}
      </div>
    </div>
  )
}
