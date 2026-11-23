"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useArchiveRecords, type ArchiveRecord } from "@/api/archiveRecords"
import { useCustomFields } from "@/api/customFields"
import { isRecordRequestEditable, useEditRecordRequest, useRecordRequest, type EditRecordRequestInput, type RecordRequest } from "@/api/recordRequests"
import { useCan } from "@/auth/useAuth"
import { PaginationFooter } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { LOAN_TYPES } from "@/domain/loan-type"
import { REQUEST_CHANNELS } from "@/domain/request-channel"
import { useClientContacts } from "@/hooks/useClientCard"
import { useDebounce } from "@/hooks/useDebounce"
import { projectIdOf, useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { RequestKindBadge, RequestStatusBadge } from "@/staff/features/record-requests/request-status-badge"

const PAGE_SIZE = 10
const MAX_RECORDS = 100 // the same limit as the server

/** Docbox "modificar petición": change an open request's details and its records. Everything is saved together, or nothing is. */
export function EditRecordRequestScreen({ requestId }: { requestId: string }) {
  const { data: request, isLoading, isError } = useRecordRequest(requestId)
  const canOperate = useCan("boxes.operate")

  if (isLoading) return <Skeleton className="h-64 w-full max-w-5xl" />
  if (isError || !request) return <p className="text-muted-foreground text-sm">This request was not found.</p>
  const back = (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/app/record-requests/${request.id}`} />}>
      Back to {request.requestNumber}
    </Button>
  )
  if (!canOperate || !isRecordRequestEditable(request)) {
    return (
      <div className="max-w-5xl space-y-3">
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {!canOperate
            ? "You don't have permission to edit requests."
            : `${request.requestNumber} is ${request.status} — only a pending or accepted request can be edited.`}
        </p>
        {back}
      </div>
    )
  }
  return <Editor request={request} back={back} />
}

function Editor({ request, back }: { request: RecordRequest; back: React.ReactNode }) {
  const router = useRouter()
  const edit = useEditRecordRequest(request.id)
  const { data: clients } = useGetClientsWithDetailsQuery()
  const { data: fields = [] } = useCustomFields(request.clientId, { includeInactive: true })
  const shown = fields.filter((f) => f.active).slice(0, 4)
  const digital = request.kind === "digital"
  const fromPortal = request.source === "portal"
  const lines = request.lines ?? []

  const [loanType, setLoanType] = useState(request.loanType)
  const [channel, setChannel] = useState(request.requestChannel ?? "")
  const [contactEmail, setContactEmail] = useState(request.contactEmail ?? "")
  const [notes, setNotes] = useState(request.notes ?? "")
  const [orderNumber, setOrderNumber] = useState(request.orderNumber ?? "")
  const [expurgo, setExpurgo] = useState(request.expurgo ?? false)
  const [reason, setReason] = useState("")
  const [removed, setRemoved] = useState<Set<string>>(new Set()) // record ids marked for removal
  const [added, setAdded] = useState<Map<string, ArchiveRecord>>(new Map())
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")

  // the client's contacts (DocuSoft) — the current one is always offered, even if DocuSoft no longer lists it
  const clientContacts = useClientContacts(request.clientId, projectIdOf(clients?.find((c) => c.ClientId === request.clientId)))
  const contacts = useMemo(() => {
    const seen = new Set<string>()
    const list = clientContacts.contacts.filter((c) => {
      const email = c.email.toLowerCase()
      if (!email || seen.has(email)) return false
      seen.add(email)
      return true
    })
    if (request.contactEmail && !seen.has(request.contactEmail.toLowerCase())) list.unshift({ id: "current", name: request.contactName ?? "Current contact", email: request.contactEmail })
    return list
  }, [clientContacts.contacts, request.contactEmail, request.contactName])

  const onRequest = new Set(lines.map((l) => l.recordId))
  const debounced = useDebounce(search.trim(), 300)
  const { data, isFetching, isError } = useArchiveRecords({ clientId: request.clientId, status: ["archived"], text: debounced || undefined, page, pageSize: PAGE_SIZE })
  const candidates = (data?.items ?? []).filter((r) => !onRequest.has(r.id))

  const total = lines.length - removed.size + added.size
  const tooMany = total > MAX_RECORDS
  const empty = total < 1

  const contactName = contacts.find((c) => c.email === contactEmail)?.name
  const body: EditRecordRequestInput = {}
  if (loanType !== request.loanType) body.loanType = loanType
  if (channel !== (request.requestChannel ?? "")) body.requestChannel = channel
  if (notes.trim() !== (request.notes ?? "")) body.notes = notes.trim()
  if (orderNumber.trim() !== (request.orderNumber ?? "")) body.orderNumber = orderNumber.trim()
  if (expurgo !== (request.expurgo ?? false)) body.expurgo = expurgo
  if (!fromPortal && contactEmail !== (request.contactEmail ?? "")) {
    body.contactEmail = contactEmail
    body.contactName = contactName ?? ""
  }
  if (added.size) body.addRecordIds = [...added.keys()]
  if (removed.size) body.removeRecordIds = [...removed]
  const changed = Object.keys(body).length > 0
  if (changed && reason.trim()) body.note = reason.trim()

  const summary = [
    body.loanType && "loan type",
    body.requestChannel !== undefined && "how they asked",
    body.notes !== undefined && "notes",
    body.orderNumber !== undefined && "order number",
    body.expurgo !== undefined && "expurgo",
    body.contactEmail !== undefined && "contact",
    added.size > 0 && `${added.size} record${added.size === 1 ? "" : "s"} added`,
    removed.size > 0 && `${removed.size} record${removed.size === 1 ? "" : "s"} removed`,
  ].filter(Boolean)

  const toggleRemove = (recordId: string) =>
    setRemoved((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  const toggleAdd = (record: ArchiveRecord, on: boolean) =>
    setAdded((prev) => {
      const next = new Map(prev)
      if (on) next.set(record.id, record)
      else next.delete(record.id)
      return next
    })

  const save = () => {
    setError("")
    edit.mutate(body, {
      onSuccess: () => {
        toast.success(`${request.requestNumber} updated.`)
        router.push(`/app/record-requests/${request.id}`)
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : "The change failed"
        setError(message)
        toast.error(message)
      },
    })
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">
          Edit <span className="font-mono">{request.requestNumber}</span>
        </h1>
        <RequestKindBadge kind={request.kind} />
        <RequestStatusBadge status={request.status} />
        <span className="text-muted-foreground text-sm">{request.clientName}</span>
        <div className="ml-auto">{back}</div>
      </div>
      <p className="text-muted-foreground text-sm">
        The client and the type (original / digital) can&apos;t be changed.{" "}
        {request.status === "requested" && !digital
          ? "This request is accepted, so its records are on loan: a record you add goes on loan now, and one you remove goes back to storage."
          : digital
            ? "A digital copy never moves the paper, so adding or removing a record only changes this request."
            : "This request is still waiting for acceptance: records you add or remove are not on loan yet, they are only held for this request."}{" "}
        Changes are saved together, or not at all.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>The client is told when the contact or the loan type changes. Notes and how they asked are for you only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="er-contact">Contact</FieldLabel>
            {fromPortal ? (
              <p id="er-contact" className="text-sm">
                {[request.contactName, request.contactEmail].filter(Boolean).join(" — ") || "—"}
                <span className="text-muted-foreground block text-xs">Asked for in the client portal — the contact can&apos;t be changed.</span>
              </p>
            ) : clientContacts.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : contacts.length > 0 ? (
              <Select value={contactEmail} onValueChange={(email) => setContactEmail(email ?? "")}>
                <SelectTrigger id="er-contact">
                  <SelectValue
                    placeholder="No contact"
                    getLabel={(email) => {
                      const c = contacts.find((x) => x.email === email)
                      return c ? `${c.name} — ${c.email}` : email
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.email}>
                      {c.name} — {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-muted-foreground text-xs">{clientContacts.isError ? "Could not load this client's contacts from DocuSoft." : "This client has no contact with an email in DocuSoft."}</p>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="er-loan">Loan type</FieldLabel>
            <Select value={loanType} onValueChange={(v) => setLoanType(v ?? request.loanType)}>
              <SelectTrigger id="er-loan">
                <SelectValue getLabel={(v) => LOAN_TYPES.find((t) => t.value === v)?.label ?? v} />
              </SelectTrigger>
              <SelectContent>
                {LOAN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="er-channel">How they asked</FieldLabel>
            <Select value={channel} onValueChange={(v) => setChannel(v ?? "")}>
              <SelectTrigger id="er-channel">
                <SelectValue placeholder="Not recorded" getLabel={(v) => REQUEST_CHANNELS.find((c) => c.value === v)?.label ?? v} />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="er-order">Order number (Nro. Pedido)</FieldLabel>
            <Input id="er-order" maxLength={50} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </Field>
          <label htmlFor="er-expurgo" className="flex items-start gap-2 self-end pb-2 text-sm">
            <Checkbox id="er-expurgo" checked={expurgo} onCheckedChange={(v) => setExpurgo(v === true)} className="mt-0.5" />
            <span>
              Expurgo — intended for destruction
              <span className="text-muted-foreground block text-xs">Information only: nothing is destroyed.</span>
            </span>
          </label>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="er-notes">Notes</FieldLabel>
            <Textarea id="er-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Records on this request <span className="text-muted-foreground text-sm font-normal">— {total} after your changes</span>
          </CardTitle>
          <CardDescription>Mark a record to remove it. A request needs at least one record — to drop them all, cancel the request instead.</CardDescription>
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
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const gone = removed.has(l.recordId)
                  return (
                    <TableRow key={l.id} data-testid={`line-${l.internalCode}`} className={gone ? "text-muted-foreground line-through" : undefined}>
                      <TableCell className="font-mono">{l.internalCode}</TableCell>
                      {shown.map((f) => (
                        <TableCell key={f.code} className="max-w-40 truncate">
                          {l.fields?.[f.code] ?? "—"}
                        </TableCell>
                      ))}
                      <TableCell className="font-mono text-xs">{l.boxNumber}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={gone ? "outline" : "ghost"}
                          className="no-underline"
                          aria-label={`${gone ? "Keep" : "Remove"} record ${l.internalCode}`}
                          onClick={() => toggleRemove(l.recordId)}
                        >
                          {gone ? "Keep" : "Remove"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {[...added.values()].map((r) => (
                  <TableRow key={r.id} data-testid={`added-${r.internalCode}`} className="bg-emerald-50/60">
                    <TableCell className="font-mono">
                      {r.internalCode} <span className="text-xs text-emerald-700">new</span>
                    </TableCell>
                    {shown.map((f) => (
                      <TableCell key={f.code} className="max-w-40 truncate">
                        {r.fields?.[f.code] ?? "—"}
                      </TableCell>
                    ))}
                    <TableCell className="font-mono text-xs">{r.boxNumber}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="ghost" aria-label={`Don't add record ${r.internalCode}`} onClick={() => toggleAdd(r, false)}>
                        Undo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {empty && <p className="text-destructive mt-2 text-sm">A request needs at least one record. Keep one, or cancel the request instead.</p>}
          {tooMany && <p className="text-destructive mt-2 text-sm">At most {MAX_RECORDS} records per request.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add records</CardTitle>
          <CardDescription>
            Only archived records of {request.clientName} that are in no other open request are listed. Search by any field value, its comments or its box number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              placeholder="Search records…"
              aria-label="Search records to add"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            <span className="text-muted-foreground text-sm">{added.size} to add</span>
          </div>
          {isError ? (
            <p className="text-destructive text-sm">The records couldn&apos;t be loaded. Try again.</p>
          ) : !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Internal code</TableHead>
                      {shown.map((f) => (
                        <TableHead key={f.code}>{f.name}</TableHead>
                      ))}
                      <TableHead>Box</TableHead>
                      <TableHead>Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4 + shown.length} className="text-muted-foreground h-16 text-center">
                          {debounced ? "No archived record matches that search." : "No other archived record to add."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      candidates.map((r) => (
                        <TableRow key={r.id} data-state={added.has(r.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox checked={added.has(r.id)} onCheckedChange={(v) => toggleAdd(r, v === true)} aria-label={`Add record ${r.internalCode}`} />
                          </TableCell>
                          <TableCell className="font-mono">{r.internalCode}</TableCell>
                          {shown.map((f) => (
                            <TableCell key={f.code} className="max-w-40 truncate">
                              {r.fields?.[f.code] ?? "—"}
                            </TableCell>
                          ))}
                          <TableCell className="font-mono text-xs">{r.boxNumber}</TableCell>
                          <TableCell className="max-w-48 truncate">{r.comments ?? "—"}</TableCell>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Save</CardTitle>
          <CardDescription>{changed ? `Changing: ${summary.join(", ")}.` : "Nothing changed yet."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="er-reason">Reason (optional)</FieldLabel>
            <Textarea id="er-reason" rows={2} maxLength={500} placeholder="Added to the history of the request and of each record" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" data-testid="edit-error" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={!changed || empty || tooMany || edit.isPending}>
              {edit.isPending ? "Saving…" : "Save changes"}
            </Button>
            {back}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
