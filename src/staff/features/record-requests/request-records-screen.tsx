"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useArchiveRecords, type ArchiveRecord } from "@/api/archiveRecords"
import { useCustomFields } from "@/api/customFields"
import { useCreateRecordRequest, type RecordRequest } from "@/api/recordRequests"
import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
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
import { useDebounce } from "@/hooks/useDebounce"
import { useClientContacts } from "@/hooks/useClientCard"
import { projectIdOf, useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const PAGE_SIZE = 25
const MAX_RECORDS = 100 // the same limit as the server

/**
 * Docbox "Peticiones de Préstamo": pick a client, search its records, tick the ones asked for (across searches and
 * pages), say who asked and how, and request them. Every record goes on loan together, or none does.
 */
export function RequestRecordsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const createRequest = useCreateRecordRequest()
  const [clientId, setClientId] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [chosen, setChosen] = useState<Map<string, ArchiveRecord>>(new Map()) // the ticked records, kept across pages
  const [loanType, setLoanType] = useState("normal")
  const [channel, setChannel] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactName, setContactName] = useState("")
  const [notes, setNotes] = useState("")
  const [done, setDone] = useState<RecordRequest | null>(null)

  const client = clients?.find((c) => c.ClientId === clientId)
  const debounced = useDebounce(search.trim(), 300)
  const { data: fields = [] } = useCustomFields(clientId)
  const shown = fields.slice(0, 4) // the first few of the client's own fields are enough to tell records apart

  // Only archived records can be asked for; the others are somewhere else already.
  const { data, isFetching, isError } = useArchiveRecords(
    { clientId, status: ["archived"], text: debounced || undefined, page, pageSize: PAGE_SIZE },
    { enabled: !!clientId },
  )
  const items = data?.items ?? []

  const clientContacts = useClientContacts(clientId, projectIdOf(clients?.find((c) => c.ClientId === clientId)))
  const contacts = useMemo(() => {
    const seen = new Set<string>()
    return clientContacts.contacts.filter((c) => {
      const email = c.email.toLowerCase()
      if (!email || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [clientContacts.contacts])

  const pickClient = (id: string) => {
    setClientId(id)
    setSearch("")
    setPage(1)
    setChosen(new Map()) // one request is for one client
    setContactEmail("")
    setContactName("")
    setDone(null)
  }

  const toggle = (record: ArchiveRecord, on: boolean) =>
    setChosen((prev) => {
      const next = new Map(prev)
      if (on) next.set(record.id, record)
      else next.delete(record.id)
      return next
    })
  const allOnPage = items.length > 0 && items.every((r) => chosen.has(r.id))
  const togglePage = (on: boolean) =>
    setChosen((prev) => {
      const next = new Map(prev)
      for (const r of items) {
        if (on) next.set(r.id, r)
        else next.delete(r.id)
      }
      return next
    })

  const tooMany = chosen.size > MAX_RECORDS
  const needsContact = contacts.length > 0 && !contactEmail
  const canSend = !!client && chosen.size > 0 && !tooMany && !needsContact && !createRequest.isPending

  const send = () => {
    if (!client) return
    createRequest.mutate(
      {
        clientId: client.ClientId,
        recordIds: [...chosen.keys()],
        loanType,
        requestChannel: channel || undefined,
        contactEmail: contactEmail || undefined,
        contactName: contactName || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (request) => {
          setDone(request)
          setChosen(new Map())
          setNotes("")
          toast.success(`${request.requestNumber}: ${request.recordCount} record${request.recordCount === 1 ? "" : "s"} requested.`)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "The request failed"),
      },
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Request records"
        description="A client asks for individual records (not whole boxes). Find them, tick the ones asked for, and request them — they go on loan together, each with a history entry."
      />

      {done && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">
              {done.requestNumber} created — {done.recordCount} record{done.recordCount === 1 ? "" : "s"} on loan for {done.clientName}.
            </p>
            <p className="text-muted-foreground text-sm">
              Internal codes: {(done.lines ?? []).map((l) => l.internalCode).join(", ")}. You can request more below.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Client</CardTitle>
          <CardDescription>One request is for one client. Changing the client clears the ticked records.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-md">
            <FieldLabel htmlFor="rq-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => pickClient(v ?? "")}>
              <SelectTrigger id="rq-client">
                <SelectValue placeholder="Choose a client" getLabel={(id) => clients?.find((c) => c.ClientId === id)?.Client ?? id} />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((c) => (
                  <SelectItem key={c.ClientId} value={c.ClientId}>
                    {c.Client}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {clientId && (
        <Card>
          <CardHeader>
            <CardTitle>2. Records</CardTitle>
            <CardDescription>
              Only archived records are listed — a record already on loan can&apos;t be requested again. Search by any of its field values, its comments or its box number.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                className="max-w-sm"
                placeholder="Search records…"
                aria-label="Search records"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
              <span className="text-muted-foreground text-sm">
                {chosen.size} selected{tooMany ? ` — at most ${MAX_RECORDS} per request` : ""}
              </span>
              {chosen.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setChosen(new Map())}>
                  Clear selection
                </Button>
              )}
            </div>

            {isError ? (
              <p className="text-destructive text-sm">The records couldn&apos;t be loaded. Try again.</p>
            ) : !data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allOnPage} onCheckedChange={(v) => togglePage(v === true)} aria-label="Select all on this page" disabled={items.length === 0} />
                        </TableHead>
                        <TableHead>Internal code</TableHead>
                        {shown.map((f) => (
                          <TableHead key={f.code}>{f.name}</TableHead>
                        ))}
                        <TableHead>Box</TableHead>
                        <TableHead>Comments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4 + shown.length} className="text-muted-foreground h-20 text-center">
                            {debounced ? "No archived record matches that search." : "This client has no archived records."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((r) => (
                          <TableRow key={r.id} data-state={chosen.has(r.id) ? "selected" : undefined}>
                            <TableCell>
                              <Checkbox checked={chosen.has(r.id)} onCheckedChange={(v) => toggle(r, v === true)} aria-label={`Select record ${r.internalCode}`} />
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
      )}

      {clientId && (
        <Card>
          <CardHeader>
            <CardTitle>3. Request details</CardTitle>
            <CardDescription>Who asked, how fast, and how they asked.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rq-contact">Contact</FieldLabel>
              {clientContacts.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : contacts.length > 0 ? (
                <Select
                  value={contactEmail}
                  onValueChange={(email) => {
                    setContactEmail(email ?? "")
                    setContactName(contacts.find((c) => c.email === email)?.name ?? "")
                  }}
                >
                  <SelectTrigger id="rq-contact">
                    <SelectValue
                      placeholder="Choose who asked"
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
                <p className="text-muted-foreground text-xs">
                  {clientContacts.isError ? "Could not load this client's contacts from DocuSoft." : "This client has no contact with an email in DocuSoft — the request is saved without one."}
                </p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="rq-loan">Loan type</FieldLabel>
              <Select value={loanType} onValueChange={(v) => setLoanType(v ?? "normal")}>
                <SelectTrigger id="rq-loan">
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
              <FieldLabel htmlFor="rq-channel">How they asked</FieldLabel>
              <Select value={channel} onValueChange={(v) => setChannel(v ?? "")}>
                <SelectTrigger id="rq-channel">
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
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="rq-notes">Notes</FieldLabel>
              <Textarea id="rq-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button onClick={send} disabled={!canSend}>
                {createRequest.isPending ? "Requesting…" : `Request ${chosen.size || ""} record${chosen.size === 1 ? "" : "s"}`.replace("  ", " ")}
              </Button>
              {needsContact && <span className="text-muted-foreground text-sm">Choose the contact who asked.</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
