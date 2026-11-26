"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useExpedientes } from "@/api/expedientes"
import { useImportRecordRequests, type RequestImportResult } from "@/api/recordRequests"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ClipboardList, Download } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { TemplateDownload } from "@/components/template-download"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { loanTypeLabel } from "@/domain/loan-type"
import {
  MAX_RECORDS_PER_REQUEST,
  MAX_REQUEST_IMPORT_ROWS,
  REQUEST_IMPORT_COLUMNS,
  checkRequestedBy,
  mergeRowErrors,
  parseRequestImportGrid,
  requestTemplateRows,
  type RequestImportRow,
} from "@/domain/record-request-import"
import { useClientContacts } from "@/hooks/useClientCard"
import { downloadCsv } from "@/lib/csv"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { projectIdOf, useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

// the file says "standard" / "urgent"; the app calls standard "Normal" elsewhere -- here it is shown as the file words it
const urgencyText = (loanType: string) => (loanType === "normal" ? "Standard" : (loanTypeLabel(loanType) ?? loanType))

/**
 * Docbox "IMPORTACION PRESTAMOS": the client sends a sheet of the records they want (internal code, physical or digital, standard or
 * urgent, who asked). Staff load it here: pick the client, check the file, create the requests. "Requested by" must be a real
 * DocuSoft contact of the client — checked here against DocuSoft's list and again by the server (which also refuses a contact
 * switched off for loans). Every row is checked first; if one is wrong nothing is created. Physical requests put their records on
 * loan; digital ones never change the physical status.
 */
export function ImportRequestsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const importRequests = useImportRecordRequests()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [blankRows, setBlankRows] = useState("50")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<RequestImportRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [serverErrors, setServerErrors] = useState<{ row: number; message: string }[]>([])
  const [plan, setPlan] = useState<RequestImportResult | null>(null) // the requests the check says it would make
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<RequestImportResult | null>(null)

  const client = clients?.find((c) => c.ClientId === clientId)
  const { data: expedientes = [] } = useExpedientes(clientId)
  const [expedienteChoice, setExpedienteChoice] = useState("")
  const expediente = expedientes.find((e) => e.id === expedienteChoice)

  // the client's contacts, read from DocuSoft (nothing is stored in our database)
  const clientContacts = useClientContacts(clientId, projectIdOf(client))
  const contacts = useMemo(() => {
    const seen = new Set<string>()
    return clientContacts.contacts.filter((c) => {
      const email = c.email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [clientContacts.contacts])
  const contactsReady = !!client && !clientContacts.isLoading && !clientContacts.isError && contacts.length > 0

  // the browser's own contact check, ready as soon as a file is loaded
  const contactErrors = useMemo(() => (contactsReady ? checkRequestedBy(rows, contacts.map((c) => c.email)) : []), [rows, contacts, contactsReady])
  const problems = useMemo(() => mergeRowErrors(contactErrors, serverErrors), [contactErrors, serverErrors])
  const checked = !!plan && problems.length === 0

  const reset = () => {
    setFileName("")
    setRows([])
    setFileProblem("")
    setServerErrors([])
    setPlan(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const onFile = async (file: File | undefined) => {
    reset()
    setDone(null)
    if (!file) return
    setFileName(file.name)
    try {
      const parsed = parseRequestImportGrid(await readTable(file))
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setServerErrors([])
    importRequests.mutate(
      {
        clientId: client.ClientId,
        clientName: client.Client,
        dryRun,
        contacts: contacts.map((c) => ({ email: c.email, name: c.name })),
        rows,
      },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setPlan(result)
            if (problems.length === 0) toast.success(`All ${result.count} rows look good — ${result.requests.length} request${result.requests.length === 1 ? "" : "s"} to create.`)
          } else {
            setDone(result)
            reset()
            toast.success(`${result.requests.length} request${result.requests.length === 1 ? "" : "s"} created.`)
          }
        },
        onError: (err) => {
          setPlan(null)
          if (err instanceof ApiError && err.rowErrors) setServerErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "The import failed")
        },
      },
    )
  }

  const templateName = `${expediente?.code ? `${expediente.code}-` : ""}${clientId || "requests"}-requests-template`
  const templateRows = requestTemplateRows({ clientId, expedienteCode: expediente?.code ?? "", blankRows: Number(blankRows) })
  const canCheck = contactsReady && rows.length > 0 && !importRequests.isPending
  const physical = plan?.requests.filter((r) => r.kind === "original").reduce((n, r) => n + r.recordCount, 0) ?? 0
  const digital = plan?.requests.filter((r) => r.kind === "digital").reduce((n, r) => n + r.recordCount, 0) ?? 0

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Import record requests"
        description="The client sends a sheet of the records they want. Load it here to create the requests in one go. Every row is checked first — if one is wrong, nothing is created."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/record-requests" />}>
            All requests
          </Button>
        }
      />

      {done && (
        <Card>
          <CardHeader>
            <CardTitle>
              {done.requests.length} request{done.requests.length === 1 ? "" : "s"} created — {done.count} record{done.count === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>The contacts were told in their portal. Open a request to deliver it or print its papers.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {done.requests.map((r) => (
                    <TableRow key={r.id ?? r.requestNumber}>
                      <TableCell className="font-mono">
                        {r.id ? (
                          <Link href={`/app/record-requests/${r.id}`} className="text-primary hover:underline">
                            {r.requestNumber}
                          </Link>
                        ) : (
                          r.requestNumber
                        )}
                      </TableCell>
                      <TableCell>{r.kind === "digital" ? "Digital copy" : "Physical (on loan)"}</TableCell>
                      <TableCell>{urgencyText(r.loanType)}</TableCell>
                      <TableCell>{r.contactName ? `${r.contactName} — ${r.contactEmail}` : r.contactEmail}</TableCell>
                      <TableCell className="text-right">{r.recordCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Client</CardTitle>
          <CardDescription>A file is for one client. &quot;Requested by&quot; must be one of this client&apos;s contacts in DocuSoft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field className="max-w-md">
            <FieldLabel htmlFor="ir-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v ?? "")
                setExpedienteChoice("")
                reset()
                setDone(null)
              }}
            >
              <SelectTrigger id="ir-client">
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
          {client &&
            (clientContacts.isLoading ? (
              <Skeleton className="h-5 w-72" />
            ) : clientContacts.isError ? (
              <p className="text-destructive text-sm">The client&apos;s contacts couldn&apos;t be read from DocuSoft. Try again in a moment — nothing can be imported without them.</p>
            ) : contacts.length === 0 ? (
              <p className="text-destructive text-sm">This client has no contact with an email address in DocuSoft. Add one there first — a request has to be for one of the client&apos;s contacts.</p>
            ) : (
              <p className="text-muted-foreground text-sm" data-testid="contacts-found">
                {contacts.length} contact{contacts.length === 1 ? "" : "s"} found in DocuSoft: {contacts.map((c) => c.name).join(", ")}.
              </p>
            ))}
          {expedientes.length > 0 && (
            <Field className="max-w-md">
              <FieldLabel htmlFor="ir-file">File (optional — fills the File column)</FieldLabel>
              <Select value={expedienteChoice} onValueChange={(v) => setExpedienteChoice(v ?? "")}>
                <SelectTrigger id="ir-file">
                  <SelectValue placeholder="Any file" getLabel={(id) => expedientes.find((x) => x.id === id)?.code ?? id} />
                </SelectTrigger>
                <SelectContent>
                  {expedientes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.code} — {e.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Template</CardTitle>
          <CardDescription>Columns: {REQUEST_IMPORT_COLUMNS.map((c) => c.header + (c.required ? "*" : "")).join(", ")}. (* = required)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>
              <span className="text-foreground font-medium">Type</span>: <b>physical</b> (the paper is sent — the record is put on loan now) or <b>digital</b> (a scan — the paper never leaves its box).
            </li>
            <li>
              <span className="text-foreground font-medium">Urgency</span>: <b>standard</b> or <b>urgent</b>.
            </li>
            <li>
              <span className="text-foreground font-medium">Requested by</span>: the email of one of the client&apos;s contacts. Rows with the same Type, Urgency and contact become one request, with at most {MAX_RECORDS_PER_REQUEST} records each.
            </li>
            <li>A record that is already in an open request, or isn&apos;t in storage, is refused. The example row (internal code 1000000) must be deleted or replaced. At most {MAX_REQUEST_IMPORT_ROWS} rows per file.</li>
          </ul>
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="ir-rows">Empty rows to add</FieldLabel>
              <Input id="ir-rows" type="number" min={0} max={MAX_REQUEST_IMPORT_ROWS} value={blankRows} onChange={(e) => setBlankRows(e.target.value)} />
            </Field>
            {client ? (
              <TemplateDownload name={templateName} rows={templateRows} />
            ) : (
              <Button variant="outline" disabled>
                Template (Excel)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="ir-upload">Excel or CSV file</FieldLabel>
            <input id="ir-upload" ref={fileInput} type="file" accept={SPREADSHEET_ACCEPT} disabled={!contactsReady} onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
            {!contactsReady && <p className="text-muted-foreground text-xs">Choose a client with contacts in step 1 first.</p>}
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} filled-in row{rows.length === 1 ? "" : "s"} read.
              {contactErrors.length > 0 && ` ${contactErrors.length} row${contactErrors.length === 1 ? "" : "s"} name${contactErrors.length === 1 ? "s" : ""} someone who isn't a contact of this client.`}
              {checked && " All rows checked — ready to create."}
            </p>
          )}
        </CardContent>
      </Card>

      {problems.length > 0 && (rows.length > 0 || serverErrors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {problems.length} row{problems.length === 1 ? "" : "s"} to fix — nothing will be created
            </CardTitle>
            <CardDescription>Row numbers are the rows of your file (the header is row 1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="max-h-72 divide-y overflow-auto rounded-xl border text-sm" data-testid="row-errors">
              {problems.map((e) => (
                <li key={e.row} className="flex gap-3 px-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">Row {e.row}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("request-import-problems.csv", [["Row", "Problem"], ...problems.map((e) => [String(e.row), e.message])])}>
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && problems.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              The check passed — {plan.requests.length} request{plan.requests.length === 1 ? "" : "s"} would be created
            </CardTitle>
            <CardDescription>
              {physical > 0 && `${physical} record${physical === 1 ? "" : "s"} would go on loan (physical). `}
              {digital > 0 && `${digital} digital cop${digital === 1 ? "y" : "ies"} — nothing is put on loan for those.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border" data-testid="plan">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.requests.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.kind === "digital" ? "Digital copy" : "Physical (on loan)"}</TableCell>
                      <TableCell>{urgencyText(r.loanType)}</TableCell>
                      <TableCell>{r.contactName ? `${r.contactName} — ${r.contactEmail}` : r.contactEmail}</TableCell>
                      <TableCell className="text-right">{r.recordCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!canCheck} onClick={() => send(true)}>
          {importRequests.isPending && !confirming ? "Checking…" : "Check file"}
        </Button>
        <Button disabled={!checked || importRequests.isPending} onClick={() => setConfirming(true)}>
          Create {plan ? `${plan.requests.length} request${plan.requests.length === 1 ? "" : "s"}` : "requests"}
        </Button>
        {(rows.length > 0 || serverErrors.length > 0 || fileProblem) && (
          <Button
            variant="ghost"
            disabled={importRequests.isPending}
            onClick={() => {
              reset()
              setDone(null)
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Create ${plan?.requests.length ?? 0} request${plan?.requests.length === 1 ? "" : "s"}?`}
        confirmLabel="Create"
        description={`${physical > 0 ? `${physical} record${physical === 1 ? "" : "s"} will be put on loan now (physical). ` : ""}${digital > 0 ? `${digital} digital cop${digital === 1 ? "y" : "ies"} — nothing is put on loan for those. ` : ""}The contacts are told in their portal. If anything goes wrong, nothing is created.`}
        onConfirm={() => send(false)}
      />
    </div>
  )
}
