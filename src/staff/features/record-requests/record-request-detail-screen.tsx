"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCustomFields } from "@/api/customFields"
import {
  isRecordRequestEditable,
  lineLocation,
  useChangeRecordRequestStatus,
  useRecordRequest,
  useRecordRequestEvents,
  type RecordRequest,
  type RecordRequestStatus,
} from "@/api/recordRequests"
import { useCan } from "@/auth/useAuth"
import { canCorrect } from "@/domain/record-request-correction"
import { CorrectRequestDialog } from "@/staff/features/record-requests/correct-request-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { locationText } from "@/domain/location"
import { loanTypeLabel } from "@/domain/loan-type"
import { requestChannelLabel } from "@/domain/request-channel"
import { formatDateTime } from "@/lib/formatting"
import { RequestKindBadge, RequestStatusBadge } from "@/staff/features/record-requests/request-status-badge"

type Action = Exclude<RecordRequestStatus, "pending">
interface Step {
  to: Action
  label: string
  text: string
  destructive?: boolean
}

/**
 * What a request can become next, worded for what really happens. The two kinds are kept apart: an ORIGINAL puts records
 * on loan (accept) and takes them back (cancel / return); a DIGITAL request never moves a record, so it never says "on
 * loan" and has no "return".
 */
function stepsFor(r: RecordRequest): Step[] {
  const digital = r.kind === "digital"
  switch (r.status) {
    case "pending":
      return [
        digital
          ? { to: "requested", label: "Accept", text: "You will make a digital copy. The paper stays in its box — nothing is put on loan." }
          : { to: "requested", label: "Accept", text: "The records are put on loan now (they must still be in storage)." },
        { to: "cancelled", label: "Cancel request", text: "Nothing was lent, so no record is changed. The client is told it was cancelled.", destructive: true },
      ]
    case "requested":
      return [
        digital
          ? { to: "delivered", label: "Mark digital copy delivered", text: "The client is told their digital copy is ready. The request is finished." }
          : { to: "delivered", label: "Mark delivered", text: "The records have been handed to the client. They stay on loan." },
        digital
          ? { to: "cancelled", label: "Cancel request", text: "No record is changed — the paper never left its box. The client is told it was cancelled.", destructive: true }
          : { to: "cancelled", label: "Cancel request", text: "The records go back to archived and can be requested again.", destructive: true },
      ]
    case "delivered":
      return digital ? [] : [{ to: "returned", label: "Mark returned", text: "Every record of this request is back: they all go to archived." }]
    default:
      return []
  }
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  accepted: "Accepted",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  edited: "Details edited",
  records_added: "Records added",
  records_removed: "Records removed",
  status_corrected: "Status corrected",
  kind_changed: "Kind changed",
}

/** One request for records: who asked, the records, and the buttons that move it on or print its papers. */
export function RecordRequestDetailScreen({ requestId }: { requestId: string }) {
  const { data: request, isLoading, isError } = useRecordRequest(requestId)
  const { data: events = [] } = useRecordRequestEvents(requestId)
  const { data: fields = [] } = useCustomFields(request?.clientId ?? "", { includeInactive: true })
  const change = useChangeRecordRequestStatus()
  const canOperate = useCan("boxes.operate")
  const [pending, setPending] = useState<Action | null>(null)
  const [note, setNote] = useState("")
  const [correcting, setCorrecting] = useState(false)

  if (isLoading) return <Skeleton className="h-64 w-full max-w-5xl" />
  if (isError || !request) return <p className="text-muted-foreground text-sm">This request was not found.</p>

  const digital = request.kind === "digital"
  const shown = fields.filter((f) => f.active).slice(0, 4)
  const lines = request.lines ?? []
  const steps = stepsFor(request)
  const choice = steps.find((a) => a.to === pending)
  const fromPortal = request.source === "portal"
  const anyBack = lines.some((l) => l.returnedAt)

  const run = async () => {
    if (!pending) return
    try {
      await change.mutateAsync({ id: request.id, to: pending, note: note.trim() || undefined })
      toast.success(`${request.requestNumber}: ${pending === "requested" ? "accepted" : pending}.`)
      setNote("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The change failed")
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-semibold">{request.requestNumber}</h1>
        <RequestKindBadge kind={request.kind} />
        <RequestStatusBadge status={request.status} />
        {fromPortal && <span className="text-muted-foreground text-xs">asked for in the client portal</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {/* a digital request has no paper going out, so no delivery note or witness slips */}
          {!digital && request.status !== "pending" && (
            <>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/record-delivery-note/${request.id}`} target="_blank" />}>
                Delivery note
              </Button>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/record-witness-slips/${request.id}`} target="_blank" />}>
                Witness slips
              </Button>
            </>
          )}
          {canOperate && isRecordRequestEditable(request) && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/app/record-requests/${request.id}/edit`} />}>
              Edit
            </Button>
          )}
          {canOperate && canCorrect(request) && (
            <Button variant="outline" size="sm" onClick={() => setCorrecting(true)}>
              Correct
            </Button>
          )}
          {canOperate &&
            steps.map((a) => (
              <Button key={a.to} size="sm" variant={a.destructive ? "destructive" : "default"} onClick={() => setPending(a.to)} disabled={change.isPending}>
                {a.label}
              </Button>
            ))}
        </div>
      </div>

      {request.status === "pending" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {digital
            ? "Waiting for you to accept it. The client asked for a digital copy — no record is lent, whatever you decide."
            : "Waiting for you to accept it. The records are still in storage; they are only put on loan when you accept."}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-x-8 gap-y-2 pt-6 text-sm sm:grid-cols-2">
          <Info label="Client" value={request.clientName} />
          <Info label="Contact" value={[request.contactName, request.contactEmail].filter(Boolean).join(" — ") || "—"} />
          <Info label="Type" value={digital ? "Digital copy (the paper stays in its box)" : "Original (the paper goes to the client)"} />
          <Info label="Loan type" value={loanTypeLabel(request.loanType) ?? request.loanType} />
          {!fromPortal && <Info label="How they asked" value={requestChannelLabel(request.requestChannel) ?? "—"} />}
          <Info label="Requested" value={`${formatDateTime(request.createdAt)}${request.requestedBy.name ? ` by ${request.requestedBy.name}` : ""}`} />
          {request.deliveredAt && <Info label={digital ? "Copy delivered" : "Delivered"} value={`${formatDateTime(request.deliveredAt)}${request.deliveredBy?.name ? ` by ${request.deliveredBy.name}` : ""}`} />}
          {request.closedAt && (
            <Info label={request.status === "cancelled" ? "Cancelled" : "Returned"} value={`${formatDateTime(request.closedAt)}${request.closedBy?.name ? ` by ${request.closedBy.name}` : ""}`} />
          )}
          {request.notes && <Info label="Notes" value={request.notes} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {request.recordCount} record{request.recordCount === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Internal code</TableHead>
                  {shown.map((f) => (
                    <TableHead key={f.code}>{f.name}</TableHead>
                  ))}
                  <TableHead>Box</TableHead>
                  <TableHead>{digital ? "Where it is" : "Taken from"}</TableHead>
                  {!digital && <TableHead>Back</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.internalCode}</TableCell>
                    {shown.map((f) => (
                      <TableCell key={f.code} className="max-w-40 truncate">
                        {l.fields?.[f.code] ?? "—"}
                      </TableCell>
                    ))}
                    <TableCell className="font-mono text-xs">{l.boxNumber}</TableCell>
                    <TableCell className="text-xs">{lineLocation(l) ? locationText(lineLocation(l)) : "—"}</TableCell>
                    {!digital && <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{l.returnedAt ? formatDateTime(l.returnedAt) : anyBack || request.status === "returned" ? "—" : "—"}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history was recorded for this request (it was made before request history existed).</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground w-36 shrink-0 text-xs">{formatDateTime(e.at)}</span>
                  <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="text-muted-foreground">
                    {e.actor.side === "client" ? `client: ${e.actor.name ?? "—"}` : (e.actor.name ?? "—")}
                    {e.note ? ` — ${e.note}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <CorrectRequestDialog request={request} open={correcting} onOpenChange={setCorrecting} />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={choice ? `${choice.label}?` : ""}
        destructive={choice?.destructive}
        confirmLabel={choice?.label}
        description={
          <span className="block space-y-3">
            <span className="block">{choice?.text}</span>
            <Textarea placeholder="Note (optional) — added to the history" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </span>
        }
        onConfirm={run}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
