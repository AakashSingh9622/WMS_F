"use client"

import Link from "next/link"
import { useState } from "react"

import { useExpedientes } from "@/api/expedientes"
import {
  RECORD_REQUEST_KINDS,
  RECORD_REQUEST_KIND_LABELS,
  RECORD_REQUEST_STATUSES,
  RECORD_REQUEST_STATUS_LABELS,
  useRecordRequests,
  type RecordRequestKind,
  type RecordRequestSearch,
  type RecordRequestStatus,
} from "@/api/recordRequests"
import { useSites } from "@/api/sites"
import { useWarehouses } from "@/api/warehouses"
import { useCan } from "@/auth/useAuth"
import { PaginationFooter } from "@/components/data-table"
import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RequestKindBadge, RequestStatusBadge } from "@/staff/features/record-requests/request-status-badge"
import { LOAN_TYPES, loanTypeLabel } from "@/domain/loan-type"
import { REQUEST_CHANNELS } from "@/domain/request-channel"
import { useDebounce } from "@/hooks/useDebounce"
import { formatDateTime } from "@/lib/formatting"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const PAGE_SIZE = 25
const ALL = "all"
const DATE_TYPES = [
  { value: "request", label: "Request date" },
  { value: "issue", label: "Issue date (Fecha Salida)" },
  { value: "closed", label: "Returned / cancelled date" },
] as const

/** A select with an "any" choice, for the filters. `options` are [value, label] pairs. */
function FilterSelect({
  id,
  title,
  value,
  onChange,
  options,
  anyLabel,
  disabled,
}: {
  id: string
  title: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  anyLabel: string
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v ?? ALL)} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue getLabel={(v) => (v === ALL ? anyLabel : (options.find(([val]) => val === v)?.[1] ?? v))} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{anyLabel}</SelectItem>
          {options.map(([val, text]) => (
            <SelectItem key={val} value={val}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** A text filter in the "More filters" panel. */
function FilterText({ id, title, value, onChange, placeholder, maxLength }: { id: string; title: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      <Input id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

const channelLabel = (value?: string) => (value ? (REQUEST_CHANNELS.find((c) => c.value === value)?.label ?? value) : "—")

/** The internal codes of a request: the first few, and how many more there are. */
function codesText(codes: number[] | undefined, total: number): string {
  if (!codes?.length) return "—"
  const shown = codes.slice(0, 3).join(", ")
  return total > 3 ? `${shown} +${total - 3}` : shown
}

/** Docbox "Peticiones": every request for records, newest request date first. Open one to deliver, cancel, return or print it. */
export function RecordRequestsListScreen() {
  const canOperate = useCan("boxes.operate")
  const { data: clients } = useGetClientsWithDetailsQuery()
  const { data: sites } = useSites()
  const { data: warehouses } = useWarehouses()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>(ALL)
  const [kind, setKind] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  // the "More filters" panel
  const [showMore, setShowMore] = useState(false)
  const [clientId, setClientId] = useState(ALL)
  const [expedienteId, setExpedienteId] = useState(ALL)
  const [dateType, setDateType] = useState<string>("request")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [channel, setChannel] = useState(ALL)
  const [loan, setLoan] = useState(ALL)
  const [requester, setRequester] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  const [code, setCode] = useState("")
  const [notes, setNotes] = useState("")
  const [expurgo, setExpurgo] = useState(ALL)
  const [site, setSite] = useState(ALL)
  const [warehouse, setWarehouse] = useState(ALL)

  const debounced = useDebounce(search.trim(), 300)
  const dRequester = useDebounce(requester.trim(), 300)
  const dOrder = useDebounce(orderNumber.trim(), 300)
  const dCode = useDebounce(code.trim(), 300)
  const dNotes = useDebounce(notes.trim(), 300)
  const scope = clientId === ALL ? undefined : clientId
  const { data: expedientes } = useExpedientes(scope ?? "")
  const pick = (v: string) => (v === ALL ? undefined : v)
  // a code that isn't digits would be refused by the server; wait until it is a number
  const codeOk = /^\d{1,9}$/.test(dCode)

  const filters: RecordRequestSearch = {
    q: debounced || undefined,
    status: status === ALL ? undefined : [status as RecordRequestStatus],
    kind: kind === ALL ? undefined : (kind as RecordRequestKind),
    clientId: scope,
    expedienteId: scope ? pick(expedienteId) : undefined,
    dateType: dateType as RecordRequestSearch["dateType"],
    from: from || undefined,
    to: to || undefined,
    requestChannel: pick(channel),
    loanType: pick(loan),
    requester: dRequester || undefined,
    orderNumber: dOrder || undefined,
    code: codeOk ? dCode : undefined,
    notes: dNotes || undefined,
    expurgo: expurgo === ALL ? undefined : expurgo === "yes",
    site: pick(site),
    warehouse: pick(warehouse),
  }
  const { data, isFetching, isError, error } = useRecordRequests({ ...filters, page, pageSize: PAGE_SIZE })
  // requests the clients asked for in the portal that nobody has accepted yet
  const { data: waiting } = useRecordRequests({ status: ["pending"], page: 1, pageSize: 1 })
  const waitingTotal = waiting?.total ?? 0

  const activeCount = [
    status !== ALL,
    kind !== ALL,
    !!debounced,
    clientId !== ALL,
    expedienteId !== ALL && !!scope,
    !!from || !!to,
    channel !== ALL,
    loan !== ALL,
    !!dRequester,
    !!dOrder,
    codeOk,
    !!dNotes,
    expurgo !== ALL,
    site !== ALL,
    warehouse !== ALL,
  ].filter(Boolean).length
  const anyFilter = activeCount > 0

  const reset = () => {
    setSearch("")
    setStatus(ALL)
    setKind(ALL)
    setClientId(ALL)
    setExpedienteId(ALL)
    setDateType("request")
    setFrom("")
    setTo("")
    setChannel(ALL)
    setLoan(ALL)
    setRequester("")
    setOrderNumber("")
    setCode("")
    setNotes("")
    setExpurgo(ALL)
    setSite(ALL)
    setWarehouse(ALL)
    setPage(1)
  }
  // any filter change goes back to the first page
  const on = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={ClipboardList}
        title="Record requests"
        description="Requests for individual records. Open one to mark it delivered, cancel it, take the records back, or print the delivery note and witness slips."
        actions={
          canOperate && (
            <div className="flex gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href="/app/record-requests/import" />}>
                Import requests
              </Button>
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
        <Input className="max-w-sm" placeholder="Request number, client or internal code…" aria-label="Search requests" value={search} onChange={(e) => on(setSearch)(e.target.value)} />
        <Select value={status} onValueChange={(v) => on(setStatus)(v ?? ALL)}>
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
        <Select value={kind} onValueChange={(v) => on(setKind)(v ?? ALL)}>
          <SelectTrigger className="w-44" aria-label="Type">
            <SelectValue getLabel={(v) => (v === ALL ? "Original and digital" : RECORD_REQUEST_KIND_LABELS[v as RecordRequestKind] ?? v)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Original and digital</SelectItem>
            {RECORD_REQUEST_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {RECORD_REQUEST_KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
          More filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
        {anyFilter && (
          <Button variant="ghost" onClick={reset}>
            Clear filters
          </Button>
        )}
      </div>

      {showMore && (
        <div className="bg-card grid gap-4 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="More filters">
          <Field>
            <FieldLabel htmlFor="rf-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                on(setClientId)(v ?? ALL)
                setExpedienteId(ALL)
              }}
            >
              <SelectTrigger id="rf-client">
                <SelectValue getLabel={(id) => (id === ALL ? "All clients" : (clients?.find((c) => c.ClientId === id)?.Client ?? id))} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All clients</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.ClientId} value={c.ClientId}>
                    {c.Client}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FilterSelect
            id="rf-file"
            title="File (expediente)"
            value={expedienteId}
            onChange={on(setExpedienteId)}
            options={(expedientes ?? []).map((e) => [e.id, `${e.code} — ${e.description}`])}
            anyLabel={scope ? "All files" : "Pick a client first"}
            disabled={!scope || (expedientes?.length ?? 0) === 0}
          />
          <FilterSelect id="rf-datetype" title="Date filter on" value={dateType} onChange={(v) => on(setDateType)(v === ALL ? "request" : v)} options={DATE_TYPES.map((d) => [d.value, d.label])} anyLabel="Request date" />
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor="rf-from">From</FieldLabel>
              <Input id="rf-from" type="date" value={from} onChange={(e) => on(setFrom)(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="rf-to">To</FieldLabel>
              <Input id="rf-to" type="date" value={to} onChange={(e) => on(setTo)(e.target.value)} />
            </Field>
          </div>
          <FilterSelect id="rf-channel" title="Request type (Tipo petición)" value={channel} onChange={on(setChannel)} options={REQUEST_CHANNELS.map((c) => [c.value, c.label])} anyLabel="Any" />
          <FilterSelect id="rf-loan" title="Loan type (Tipo préstamo)" value={loan} onChange={on(setLoan)} options={LOAN_TYPES.map((t) => [t.value, t.label])} anyLabel="Any" />
          <FilterText id="rf-requester" title="Requested by (Solicitado por)" value={requester} onChange={on(setRequester)} placeholder="Name or email" />
          <FilterText id="rf-order" title="Order number (Nro. Pedido)" value={orderNumber} onChange={on(setOrderNumber)} maxLength={50} placeholder="Part of the number" />
          <FilterText id="rf-code" title="Internal code" value={code} onChange={on(setCode)} placeholder="e.g. 1000021" />
          <FilterText id="rf-notes" title="Notes" value={notes} onChange={on(setNotes)} placeholder="Part of the notes" />
          <FilterSelect id="rf-expurgo" title="Expurgo" value={expurgo} onChange={on(setExpurgo)} options={[["yes", "Yes — intended for destruction"], ["no", "No"]]} anyLabel="Any" />
          <FilterSelect id="rf-site" title="Site (Sede)" value={site} onChange={on(setSite)} options={(sites ?? []).map((s) => [s.name, s.name])} anyLabel="All sites" />
          <FilterSelect id="rf-warehouse" title="Warehouse (Almacén)" value={warehouse} onChange={on(setWarehouse)} options={(warehouses ?? []).map((w) => [w.code, `${w.code} — ${w.name}`])} anyLabel="All warehouses" />
          <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-4">
            File, site and warehouse are the records&apos; own: a request is listed when one of its records matches all of the ones you chose. The internal code filter waits until you have typed a number.
          </p>
        </div>
      )}

      {waitingTotal > 0 && status !== "pending" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            <strong>{waitingTotal}</strong> request{waitingTotal === 1 ? " is" : "s are"} waiting for you to accept {waitingTotal === 1 ? "it" : "them"} — asked for in the client portal.
          </span>
          <Button size="sm" variant="outline" onClick={() => on(setStatus)("pending")}>
            Show them
          </Button>
        </div>
      )}

      {isError ? (
        <p className="text-destructive text-sm">{error instanceof Error && error.message ? error.message : "The requests couldn't be loaded. Try again."}</p>
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
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Request type</TableHead>
                  <TableHead>Loan type</TableHead>
                  <TableHead>Order no.</TableHead>
                  <TableHead>Internal codes</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-muted-foreground h-24 text-center">
                      {anyFilter ? "No request matches." : "No requests for records yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        <Link href={`/app/record-requests/${r.id}`} className="text-primary hover:underline">
                          {r.requestNumber}
                        </Link>
                        {r.expurgo && (
                          <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-900" title="Intended for destruction (information only)">
                            Expurgo
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{r.clientName}</TableCell>
                      <TableCell className="max-w-40 truncate" title={r.files?.join(", ")}>
                        {r.files?.length ? r.files.join(", ") : "—"}
                      </TableCell>
                      <TableCell>
                        <RequestKindBadge kind={r.kind} />
                        {r.source === "portal" && <span className="text-muted-foreground ml-2 text-xs">portal</span>}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{r.contactName || r.contactEmail || "—"}</TableCell>
                      <TableCell>{channelLabel(r.requestChannel)}</TableCell>
                      <TableCell>{loanTypeLabel(r.loanType) ?? r.loanType}</TableCell>
                      <TableCell className="max-w-32 truncate" title={r.orderNumber}>
                        {r.orderNumber ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{codesText(r.codes, r.recordCount)}</TableCell>
                      <TableCell className="text-right">{r.recordCount}</TableCell>
                      <TableCell>
                        <RequestStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate text-xs" title={r.notes}>
                        {r.notes ?? "—"}
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
    </div>
  )
}
