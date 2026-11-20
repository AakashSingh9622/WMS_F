"use client"

import Link from "next/link"
import { useState } from "react"

import {
  RECORD_REQUEST_STATUSES,
  RECORD_REQUEST_STATUS_LABELS,
  useRecordRequests,
  type RecordRequestStatus,
} from "@/api/recordRequests"
import { useCan } from "@/auth/useAuth"
import { PaginationFooter } from "@/components/data-table"
import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RequestStatusBadge } from "@/staff/features/record-requests/request-status-badge"
import { loanTypeLabel } from "@/domain/loan-type"
import { useDebounce } from "@/hooks/useDebounce"
import { formatDateTime } from "@/lib/formatting"

const PAGE_SIZE = 25
const ALL = "all"

/** Docbox "Peticiones": every request for records, newest first. Open one to deliver, cancel, return or print it. */
export function RecordRequestsListScreen() {
  const canOperate = useCan("boxes.operate")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim(), 300)
  const { data, isFetching, isError } = useRecordRequests({
    q: debounced || undefined,
    status: status === ALL ? undefined : [status as RecordRequestStatus],
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={ClipboardList}
        title="Record requests"
        description="Requests for individual records. Open one to mark it delivered, cancel it, take the records back, or print the delivery note and witness slips."
        actions={
          canOperate && (
            <div className="flex gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href="/app/record-requests/returns" />}>
                Return records
              </Button>
              <Button nativeButton={false} render={<Link href="/app/record-requests/new" />}>
                New request
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          placeholder="Request number, client or internal code…"
          aria-label="Search requests"
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
          <SelectTrigger className="w-44" aria-label="Status">
            <SelectValue getLabel={(v) => (v === ALL ? "Any status" : RECORD_REQUEST_STATUS_LABELS[v as RecordRequestStatus] ?? v)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {RECORD_REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {RECORD_REQUEST_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <p className="text-destructive text-sm">The requests couldn&apos;t be loaded. Try again.</p>
      ) : !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="bg-background sticky top-0">
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Loan type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                      {debounced || status !== ALL ? "No request matches." : "No requests for records yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        <Link href={`/app/record-requests/${r.id}`} className="text-primary hover:underline">
                          {r.requestNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{r.clientName}</TableCell>
                      <TableCell className="max-w-48 truncate">{r.contactName || r.contactEmail || "—"}</TableCell>
                      <TableCell className="text-right">{r.recordCount}</TableCell>
                      <TableCell>{loanTypeLabel(r.loanType) ?? r.loanType}</TableCell>
                      <TableCell>
                        <RequestStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
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
    </div>
  )
}
