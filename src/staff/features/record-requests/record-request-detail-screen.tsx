"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCustomFields } from "@/api/customFields"
import { lineLocation, useChangeRecordRequestStatus, useRecordRequest, type RecordRequestStatus } from "@/api/recordRequests"
import { useCan } from "@/auth/useAuth"
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
import { RequestStatusBadge } from "@/staff/features/record-requests/request-status-badge"

type Action = Exclude<RecordRequestStatus, "requested">

// What each status can become, and what the button and the confirmation say.
const NEXT: Record<RecordRequestStatus, { to: Action; label: string; text: string; destructive?: boolean }[]> = {
  requested: [
    { to: "delivered", label: "Mark delivered", text: "The records have been handed to the client. They stay on loan." },
    { to: "cancelled", label: "Cancel request", text: "The records go back to archived and can be requested again.", destructive: true },
  ],
  delivered: [{ to: "returned", label: "Mark returned", text: "Every record of this request is back: they all go to archived." }],
  returned: [],
  cancelled: [],
}

/** One request for records: who asked, the records, and the buttons that move it on or print its papers. */
export function RecordRequestDetailScreen({ requestId }: { requestId: string }) {
  const { data: request, isLoading, isError } = useRecordRequest(requestId)
  const { data: fields = [] } = useCustomFields(request?.clientId ?? "", { includeInactive: true })
  const change = useChangeRecordRequestStatus()
  const canOperate = useCan("boxes.operate")
  const [pending, setPending] = useState<Action | null>(null)
  const [note, setNote] = useState("")

  if (isLoading) return <Skeleton className="h-64 w-full max-w-5xl" />
  if (isError || !request) return <p className="text-muted-foreground text-sm">This request was not found.</p>

  const shown = fields.filter((f) => f.active).slice(0, 4)
  const lines = request.lines ?? []
  const actions = NEXT[request.status]
  const choice = actions.find((a) => a.to === pending)

  const run = async () => {
    if (!pending) return
    try {
      await change.mutateAsync({ id: request.id, to: pending, note: note.trim() || undefined })
      toast.success(`${request.requestNumber} is now ${pending}.`)
      setNote("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The change failed")
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-semibold">{request.requestNumber}</h1>
        <RequestStatusBadge status={request.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/record-delivery-note/${request.id}`} target="_blank" />}>
            Delivery note
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/record-witness-slips/${request.id}`} target="_blank" />}>
            Witness slips
          </Button>
          {canOperate &&
            actions.map((a) => (
              <Button key={a.to} size="sm" variant={a.destructive ? "destructive" : "default"} onClick={() => setPending(a.to)} disabled={change.isPending}>
                {a.label}
              </Button>
            ))}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-x-8 gap-y-2 pt-6 text-sm sm:grid-cols-2">
          <Info label="Client" value={request.clientName} />
          <Info label="Contact" value={[request.contactName, request.contactEmail].filter(Boolean).join(" — ") || "—"} />
          <Info label="Loan type" value={loanTypeLabel(request.loanType) ?? request.loanType} />
          <Info label="How they asked" value={requestChannelLabel(request.requestChannel) ?? "—"} />
          <Info label="Requested" value={`${formatDateTime(request.createdAt)}${request.requestedBy.name ? ` by ${request.requestedBy.name}` : ""}`} />
          {request.deliveredAt && <Info label="Delivered" value={`${formatDateTime(request.deliveredAt)}${request.deliveredBy?.name ? ` by ${request.deliveredBy.name}` : ""}`} />}
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
                  <TableHead>Taken from</TableHead>
                  <TableHead>Back</TableHead>
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
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{l.returnedAt ? formatDateTime(l.returnedAt) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={choice ? `${choice.label}?` : ""}
        destructive={choice?.destructive}
        confirmLabel={choice?.label}
        description={
          <span className="block space-y-3">
            <span className="block">{choice?.text}</span>
            <Textarea placeholder="Note (optional) — added to each record's history" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
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
