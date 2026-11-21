"use client"

import { useState } from "react"

import { useExpedientes } from "@/api/expedientes"
import { useArchiveReport, useInterfilingReport, useLoansReport, useRequesters } from "@/api/reports"
import { useSites } from "@/api/sites"
import { useWarehouses } from "@/api/warehouses"
import { PaginationFooter } from "@/components/data-table"
import { Download, ScrollText } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LOAN_TYPES } from "@/domain/loan-type"
import { REQUEST_CHANNELS } from "@/domain/request-channel"
import { downloadCsv } from "@/lib/csv"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const ALL = "__all__"
const STATUSES = ["stored", "reserved", "picked", "out", "received", "unallocated", "quarantined", "missing", "pending_destruction", "digitized"]
const STATES = [
  { value: "archived", label: "Archived" },
  { value: "loan", label: "On loan" },
  { value: "transit", label: "In transit" },
]
const label = (s: string) => s.replace(/_/g, " ")

/** A select with an "all" choice, for the filters. `options` are [value, label] pairs. */
function Picker({
  id,
  title,
  value,
  onChange,
  options,
  allLabel,
  disabled,
}: {
  id: string
  title: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  allLabel: string
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v ?? ALL)} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue getLabel={(v) => (v === ALL ? allLabel : (options.find(([val]) => val === v)?.[1] ?? v))} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
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

/** The "split by file" switch of a report (Docbox "Desglosar por expediente"). */
function SplitSwitch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Split by file (expediente)
    </label>
  )
}

/** Reports (Docbox "Informes"): loan requests by type and urgency, and the archive by client, box size and status. */
export function ReportsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const { data: sites } = useSites()
  const { data: warehouses } = useWarehouses()
  const [clientId, setClientId] = useState(ALL)
  const [expedienteId, setExpedienteId] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [status, setStatus] = useState(ALL)
  const [state, setState] = useState(ALL)
  const [site, setSite] = useState(ALL)
  const [warehouse, setWarehouse] = useState(ALL)
  const [requester, setRequester] = useState(ALL)
  const [channel, setChannel] = useState(ALL)
  const [loanType, setLoanType] = useState(ALL)
  const [loansByFile, setLoansByFile] = useState(false)
  const [archiveByFile, setArchiveByFile] = useState(false)
  const scope = clientId === ALL ? undefined : clientId
  const pick = (v: string) => (v === ALL ? undefined : v)

  const { data: expedientes } = useExpedientes(scope ?? "")
  const { data: requesters } = useRequesters(scope)
  const fileId = scope ? pick(expedienteId) : undefined

  const loans = useLoansReport({
    clientId: scope,
    from: from || undefined,
    to: to || undefined,
    expedienteId: fileId,
    requester: pick(requester),
    requestChannel: pick(channel),
    loanType: pick(loanType),
    byExpediente: loansByFile ? "true" : undefined,
  })
  // What the archive, interfiling and their CSV share (Docbox "Listado archivo").
  const archiveFilters = {
    clientId: scope,
    expedienteId: fileId,
    site: pick(site),
    warehouse: pick(warehouse),
    state: pick(state),
    status: pick(status),
    from: from || undefined,
    to: to || undefined,
  }
  // The interfiling page goes back to 1 whenever a filter changes.
  const [interState, setInterState] = useState({ key: "", page: 1 })
  const interKey = JSON.stringify(archiveFilters)
  const interPage = interState.key === interKey ? interState.page : 1
  const setInterPage = (page: number) => setInterState({ key: interKey, page })
  const INTER_PAGE_SIZE = 25
  const interfiling = useInterfilingReport({ ...archiveFilters, page: interPage, pageSize: INTER_PAGE_SIZE })
  const archive = useArchiveReport({ ...archiveFilters, byExpediente: archiveByFile ? "true" : undefined })

  const loanRows = loans.data?.rows ?? []
  const sum = (key: "physicalUrgent" | "physicalNormal" | "physicalSuperior" | "digitalUrgent" | "digitalNormal" | "digitalSuperior" | "fax" | "orders" | "boxes") =>
    loanRows.reduce((n, r) => n + r[key], 0)
  const archiveRows = archive.data?.rows ?? []
  const totalBoxes = archiveRows.reduce((n, r) => n + r.boxes, 0)
  const countKey = (r: { clientId: string; expedienteCode?: string }) => (archiveByFile ? `${r.clientId}|${r.expedienteCode ?? ""}` : r.clientId)
  const interfilingCsv = new URLSearchParams(Object.entries(archiveFilters).filter(([, v]) => v) as [string, string][]).toString()

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Reports"
        description="Requests by type and loan type, and what is in the archive, per client."
      />

      <div className="bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="rp-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v ?? ALL)
                setExpedienteId(ALL)
                setRequester(ALL)
              }}
            >
              <SelectTrigger id="rp-client">
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
          <Picker
            id="rp-file"
            title="File (expediente)"
            value={expedienteId}
            onChange={setExpedienteId}
            options={(expedientes ?? []).map((e) => [e.id, `${e.code} — ${e.description}`])}
            allLabel={scope ? "All files" : "Pick a client first"}
            disabled={!scope || (expedientes?.length ?? 0) === 0}
          />
          <Field>
            <FieldLabel htmlFor="rp-from">From</FieldLabel>
            <Input id="rp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rp-to">To</FieldLabel>
            <Input id="rp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">The dates are when requests were made, and when boxes came in (entry date).</p>

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Archive and interfiling</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Picker id="rp-site" title="Site (Sede)" value={site} onChange={setSite} options={(sites ?? []).map((s) => [s.name, s.name])} allLabel="All sites" />
            <Picker
              id="rp-warehouse"
              title="Warehouse (Almacén)"
              value={warehouse}
              onChange={setWarehouse}
              options={(warehouses ?? []).map((w) => [w.code, `${w.code} — ${w.name}`])}
              allLabel="All warehouses"
            />
            <Picker id="rp-state" title="State (Estado)" value={state} onChange={setState} options={STATES.map((s) => [s.value, s.label])} allLabel="Archived + on loan + in transit" />
            <Picker
              id="rp-status"
              title="Box status"
              value={status}
              onChange={setStatus}
              options={STATUSES.map((s) => [s, label(s)])}
              allLabel="All (not destroyed)"
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Requests</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Picker
              id="rp-requester"
              title="Requested by (Solicitado por)"
              value={requester}
              onChange={setRequester}
              options={(requesters ?? []).map((r) => [r.email, r.name ? `${r.name} (${r.email})` : r.email])}
              allLabel="Anyone"
            />
            <Picker id="rp-channel" title="Request type (Tipo petición)" value={channel} onChange={setChannel} options={REQUEST_CHANNELS.map((c) => [c.value, c.label])} allLabel="Any" />
            <Picker id="rp-loan" title="Loan type (Tipo préstamo)" value={loanType} onChange={setLoanType} options={LOAN_TYPES.map((t) => [t.value, t.label])} allLabel="Any" />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Requests by type and loan type</CardTitle>
            <CardDescription>
              Physical = boxes sent out (dispatch). Digital = scanned (digitize). Cancelled and rejected requests are left out.
            </CardDescription>
            <div className="mt-2">
              <SplitSwitch id="rp-loans-split" checked={loansByFile} onChange={setLoansByFile} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loanRows.length === 0}
            onClick={() =>
              downloadCsv("requests-report.csv", [
                ["Client", "Client id", ...(loansByFile ? ["File"] : []), "Physical normal", "Physical urgent", "Physical superior", "Digital normal", "Digital urgent", "Digital superior", "By fax", "Orders", "Boxes"],
                ...loanRows.map((r) =>
                  [r.clientName, r.clientId, ...(loansByFile ? [r.expedienteCode ?? ""] : []), r.physicalNormal, r.physicalUrgent, r.physicalSuperior, r.digitalNormal, r.digitalUrgent, r.digitalSuperior, r.fax, r.orders, r.boxes].map(String)
                ),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loans.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : loanRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No requests match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  {loansByFile && <TableHead>File</TableHead>}
                  <TableHead className="text-right">Physical normal</TableHead>
                  <TableHead className="text-right">Physical urgent</TableHead>
                  <TableHead className="text-right">Physical superior</TableHead>
                  <TableHead className="text-right">Digital normal</TableHead>
                  <TableHead className="text-right">Digital urgent</TableHead>
                  <TableHead className="text-right">Digital superior</TableHead>
                  <TableHead className="text-right">By fax</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loanRows.map((r) => (
                  <TableRow key={`${r.clientId}|${r.expedienteCode ?? ""}`}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    {loansByFile && <TableCell>{r.expedienteCode ?? "—"}</TableCell>}
                    <TableCell className="text-right">{r.physicalNormal}</TableCell>
                    <TableCell className="text-right">{r.physicalUrgent}</TableCell>
                    <TableCell className="text-right">{r.physicalSuperior}</TableCell>
                    <TableCell className="text-right">{r.digitalNormal}</TableCell>
                    <TableCell className="text-right">{r.digitalUrgent}</TableCell>
                    <TableCell className="text-right">{r.digitalSuperior}</TableCell>
                    <TableCell className="text-right">{r.fax}</TableCell>
                    <TableCell className="text-right">{r.boxes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={loansByFile ? 2 : 1}>Total</TableCell>
                  <TableCell className="text-right">{sum("physicalNormal")}</TableCell>
                  <TableCell className="text-right">{sum("physicalUrgent")}</TableCell>
                  <TableCell className="text-right">{sum("physicalSuperior")}</TableCell>
                  <TableCell className="text-right">{sum("digitalNormal")}</TableCell>
                  <TableCell className="text-right">{sum("digitalUrgent")}</TableCell>
                  <TableCell className="text-right">{sum("digitalSuperior")}</TableCell>
                  <TableCell className="text-right">{sum("fax")}</TableCell>
                  <TableCell className="text-right">{sum("boxes")}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Archive by client, box size and status</CardTitle>
            <CardDescription>
              How many boxes each client has, with the containers (NCE) and the number of records (archive records, destroyed ones left out). Uses the client, file, site, warehouse, state and dates chosen above.
            </CardDescription>
            <div className="mt-2">
              <SplitSwitch id="rp-archive-split" checked={archiveByFile} onChange={setArchiveByFile} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={archiveRows.length === 0}
            onClick={() =>
              downloadCsv("archive-report.csv", [
                ["Client", "Client id", ...(archiveByFile ? ["File"] : []), "Box size", "Status", "Boxes", "Containers (NCE)", "Records"],
                ...archiveRows.map((r) => [
                  r.clientName,
                  r.clientId,
                  ...(archiveByFile ? [r.expedienteCode ?? ""] : []),
                  r.size,
                  label(r.status),
                  String(r.boxes),
                  String(archive.data?.containers[countKey(r)] ?? 0),
                  String(archive.data?.records[countKey(r)] ?? 0),
                ]),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {archive.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : archiveRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No boxes match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  {archiveByFile && <TableHead>File</TableHead>}
                  <TableHead>Box size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">Containers (NCE)</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archiveRows.map((r) => (
                  <TableRow key={`${r.clientId}:${r.expedienteCode ?? ""}:${r.size}:${r.status}`}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    {archiveByFile && <TableCell>{r.expedienteCode ?? "—"}</TableCell>}
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="capitalize">{label(r.status)}</TableCell>
                    <TableCell className="text-right">{r.boxes}</TableCell>
                    <TableCell className="text-right">{archive.data?.containers[countKey(r)] ?? 0}</TableCell>
                    <TableCell className="text-right">{archive.data?.records[countKey(r)] ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={archiveByFile ? 4 : 3}>Total</TableCell>
                  <TableCell className="text-right">{totalBoxes}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            Containers and records are counted per client (or per client and file when split) over the same boxes, so a client with several sizes shows the same figure on each of its rows.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Interfiling by client</CardTitle>
            <CardDescription>
              Boxes that hold recorded files (contents), with how many and the filing dates they cover. Uses the same filters as the archive.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={`/api/exports/interfiling.csv${interfilingCsv ? `?${interfilingCsv}` : ""}`} download />}
          >
            <Download /> CSV (all)
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {interfiling.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (interfiling.data?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No box holds recorded files yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Box</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(interfiling.data?.items ?? []).map((r) => (
                    <TableRow key={r.boxId}>
                      <TableCell className="font-medium">{r.clientName}</TableCell>
                      <TableCell>{r.boxNumber}</TableCell>
                      <TableCell className="capitalize">{label(r.status)}</TableCell>
                      <TableCell>{r.location ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.records}</TableCell>
                      <TableCell>{r.filedFrom || r.filedTo ? `${r.filedFrom ?? "…"} – ${r.filedTo ?? "…"}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationFooter page={interPage} pageSize={INTER_PAGE_SIZE} total={interfiling.data?.total ?? 0} onPageChange={setInterPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
