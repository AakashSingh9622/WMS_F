"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import {
  PURGE_REQUEST_STATUSES,
  PURGE_REQUEST_STATUS_LABELS,
  useDecidePurgeRequest,
  usePurgeRequest,
  usePurgeRequests,
  type PurgeRequestStatus,
} from "@/api/recordPurges"
import { useAuth, useCan } from "@/auth/useAuth"
import { PaginationFooter } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/formatting"

const PAGE_SIZE = 25
const ALL = "all"

const VARIANT: Record<PurgeRequestStatus, "secondary" | "default" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
}

/** One purge request opened: the rows that were uploaded, and the buttons that decide it. */
function ReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth()
  const canApprove = useCan("records.approve")
  const { data: request, isLoading } = usePurgeRequest(id)
  const decide = useDecidePurgeRequest()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])

  const mine = !!request && !!user && request.preparedBy.id === user.id // the preparer: may cancel, may NOT approve or reject
  const pending = request?.status === "pending"

  const run = (action: "approve" | "reject" | "cancel") => {
    if (!request) return
    setRowErrors([])
    decide.mutate(
      { id: request.id, action, note: note.trim() || undefined },
      {
        onSuccess: (r) => {
          toast.success(`${r.requestNumber}: ${PURGE_REQUEST_STATUS_LABELS[r.status].toLowerCase()}.`)
          setRejecting(false)
          setNote("")
          if (action !== "approve") onClose()
        },
        onError: (err) => {
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "That failed")
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !decide.isPending && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{request?.requestNumber ?? "…"}</span>
            {request && <Badge variant={VARIANT[request.status]}>{PURGE_REQUEST_STATUS_LABELS[request.status]}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {request ? `${request.clientName} — prepared by ${request.preparedBy.name ?? "?"} on ${formatDateTime(request.createdAt)}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !request ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{request.purgeCount}</span> record{request.purgeCount === 1 ? "" : "s"} to purge
              {request.loanCount > 0 ? <>, <span className="font-medium">{request.loanCount}</span> to lend</> : ""}.{" "}
              {pending ? "Nothing has been changed yet." : request.status === "approved" ? "It was approved and has been carried out." : "Nothing was changed."}
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Internal code</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Authorised by</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(request.rows ?? []).map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="font-mono">{r.internalCode}</TableCell>
                      <TableCell className={r.action.toLowerCase() === "loan" ? "" : "text-destructive font-medium"}>{r.action}</TableCell>
                      <TableCell>{r.authorisedBy || "—"}</TableCell>
                      <TableCell>{r.date || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {request.decidedBy && (
              <p className="text-muted-foreground text-sm">
                {PURGE_REQUEST_STATUS_LABELS[request.status]} by {request.decidedBy.name ?? "?"} on {formatDateTime(request.decidedAt)}
                {request.decisionNote ? ` — “${request.decisionNote}”` : ""}.
                {request.result?.requestNumber && (
                  <>
                    {" "}Loans are on{" "}
                    <Link href={`/app/record-requests/${request.result.requestId}`} className="text-primary hover:underline">
                      {request.result.requestNumber}
                    </Link>
                    .
                  </>
                )}
              </p>
            )}

            {pending && mine && (
              <p className="bg-muted rounded-md p-2 text-sm">You prepared this purge, so you can&apos;t approve or reject it — a different person with approval rights must. You can cancel it if the file was wrong.</p>
            )}
            {pending && !mine && !canApprove && <p className="bg-muted rounded-md p-2 text-sm">You don&apos;t have approval rights. A records manager must approve this.</p>}

            {rowErrors.length > 0 && (
              <div className="border-destructive/40 rounded-md border p-2 text-sm">
                <p className="text-destructive font-medium">Not purged — these rows are no longer valid. Reject this request and upload a corrected file.</p>
                <ul className="mt-1 space-y-0.5">
                  {rowErrors.map((e, i) => (
                    <li key={`${e.row}-${i}`}>
                      <span className="text-muted-foreground">Row {e.row}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rejecting && (
              <Textarea placeholder="Why is it rejected? (required)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </div>
        )}

        <DialogFooter>
          {pending && mine && (
            <Button variant="outline" disabled={decide.isPending} onClick={() => run("cancel")}>
              Cancel this purge
            </Button>
          )}
          {pending && !mine && canApprove && !rejecting && (
            <>
              <Button variant="outline" disabled={decide.isPending} onClick={() => setRejecting(true)}>
                Reject
              </Button>
              <Button variant="destructive" disabled={decide.isPending} onClick={() => run("approve")}>
                {decide.isPending ? "Working…" : `Approve and purge ${request?.purgeCount ?? ""}`}
              </Button>
            </>
          )}
          {pending && !mine && canApprove && rejecting && (
            <>
              <Button variant="ghost" disabled={decide.isPending} onClick={() => { setRejecting(false); setNote("") }}>
                Back
              </Button>
              <Button disabled={decide.isPending || !note.trim()} onClick={() => run("reject")}>
                Reject request
              </Button>
            </>
          )}
          <Button variant="ghost" disabled={decide.isPending} onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Purge files waiting for a second person, and what happened to the earlier ones. */
export function PurgeApprovalsScreen() {
  const [status, setStatus] = useState<string>("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const { data, isFetching, isError } = usePurgeRequests({
    status: status === ALL ? undefined : [status as PurgeRequestStatus],
    q: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        A purge file doesn&apos;t destroy anything when it is uploaded. It waits here until a <span className="text-foreground font-medium">different person</span> with
        approval rights approves it. Whoever prepared it can&apos;t approve or reject it — only cancel it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Request number or client…"
          aria-label="Search purge requests"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v ?? ALL)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-52" aria-label="Status">
            <SelectValue getLabel={(v) => (v === ALL ? "Any status" : PURGE_REQUEST_STATUS_LABELS[v as PurgeRequestStatus] ?? v)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {PURGE_REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PURGE_REQUEST_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <p className="text-destructive text-sm">The purge requests couldn&apos;t be loaded. Try again.</p>
      ) : !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">To purge</TableHead>
                  <TableHead className="text-right">To lend</TableHead>
                  <TableHead>Prepared by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prepared</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                      {status === "pending" && !search ? "Nothing is waiting for approval." : "No purge request matches."}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.requestNumber}</TableCell>
                      <TableCell>{r.clientName}</TableCell>
                      <TableCell className="text-right">{r.purgeCount}</TableCell>
                      <TableCell className="text-right">{r.loanCount}</TableCell>
                      <TableCell>{r.preparedBy.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANT[r.status]}>{PURGE_REQUEST_STATUS_LABELS[r.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={r.status === "pending" ? "default" : "outline"} onClick={() => setOpen(r.id)}>
                          {r.status === "pending" ? "Review" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className={isFetching ? "opacity-60" : undefined}>
            <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </div>
        </>
      )}

      {open && <ReviewDialog id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
