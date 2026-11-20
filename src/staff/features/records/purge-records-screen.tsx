"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useExpedientes } from "@/api/expedientes"
import { usePurgeRecordsByFile, type PurgeResult } from "@/api/recordPurges"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Download } from "@/components/icons"
import { TemplateDownload } from "@/components/template-download"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LOAN_TYPES } from "@/domain/loan-type"
import { MAX_RECORD_PURGE_ROWS, RECORD_PURGE_COLUMNS, isLoanAction, isPurgeAction, parseRecordPurgeGrid, recordPurgeTemplateRows, type RecordPurgeRow } from "@/domain/record-purge"
import { useClientContacts } from "@/hooks/useClientCard"
import { downloadCsv } from "@/lib/csv"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { projectIdOf, useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

/**
 * Docbox "Expurgo" by file: one Excel file for one client. Each row either purges a record (destroyed for good, with who
 * authorised it and when) or lends it (the loan rows become one record request). Every row is checked first — if one is
 * wrong, nothing is changed.
 */
export function PurgeRecordsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const run = usePurgeRecordsByFile()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [blankRows, setBlankRows] = useState("50")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<RecordPurgeRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<PurgeResult | null>(null)
  // for the loan rows
  const [loanType, setLoanType] = useState("normal")
  const [contactEmail, setContactEmail] = useState("")
  const [contactName, setContactName] = useState("")

  const client = clients?.find((c) => c.ClientId === clientId)
  const { data: expedientes = [] } = useExpedientes(clientId)
  const [expedienteChoice, setExpedienteChoice] = useState("")
  const expediente = expedientes.find((e) => e.id === expedienteChoice)

  const purgeRows = rows.filter((r) => isPurgeAction(r.action)).length
  const loanRows = rows.filter((r) => isLoanAction(r.action)).length

  const clientContacts = useClientContacts(clientId, projectIdOf(client))
  const contacts = useMemo(() => {
    const seen = new Set<string>()
    return clientContacts.contacts.filter((c) => {
      const email = c.email.toLowerCase()
      if (!email || seen.has(email)) return false
      seen.add(email)
      return true
    })
  }, [clientContacts.contacts])
  const needsContact = loanRows > 0 && contacts.length > 0 && !contactEmail

  const reset = () => {
    setFileName("")
    setRows([])
    setFileProblem("")
    setRowErrors([])
    setChecked(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  const onFile = async (file: File | undefined) => {
    reset()
    setDone(null)
    if (!file) return
    setFileName(file.name)
    try {
      const parsed = parseRecordPurgeGrid(await readTable(file))
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    run.mutate(
      {
        clientId: client.ClientId,
        clientName: client.Client,
        dryRun,
        rows,
        loan: loanRows > 0 ? { loanType, contactEmail: contactEmail || undefined, contactName: contactName || undefined } : undefined,
      },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${rows.length} rows look good.`)
          } else {
            setDone(result)
            reset()
            toast.success(result.pending ? `${result.requestNumber} is waiting for a second person to approve it.` : `${result.lent ?? 0} lent.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "The file couldn't be processed")
        },
      },
    )
  }

  const templateName = `${expediente?.code ? `${expediente.code}-` : ""}${clientId || "records"}-purge-template`
  const templateRows = recordPurgeTemplateRows({ clientId, expedienteCode: expediente?.code ?? "", blankRows: Number(blankRows) })
  const canSend = !!client && rows.length > 0 && !run.isPending

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-muted-foreground text-sm">
        Purge records from a file. Each row is one record, found by its internal code, and says what to do with it:{" "}
        <span className="text-foreground font-medium">purge</span> destroys it for good (who authorised it and the date are required, and a
        box under legal hold is refused), <span className="text-foreground font-medium">loan</span> puts it on one record request. Every row
        is checked first — if one is wrong, nothing is changed. <span className="text-foreground font-medium">A file with purge rows does not run when you send it:</span>{" "}
        it waits for a different person to approve it (see the Purge approvals tab).
      </p>

      {done && (
        <Card>
          <CardContent className="pt-6">
            {done.pending ? (
              <>
                <p className="font-medium">
                  {done.requestNumber} is waiting for approval — {done.purgeCount ?? 0} record{done.purgeCount === 1 ? "" : "s"} to purge{(done.loanCount ?? 0) > 0 ? `, ${done.loanCount} to lend` : ""}.
                </p>
                <p className="text-muted-foreground text-sm">
                  Nothing has been destroyed. A different person with approval rights must approve it in{" "}
                  <Link href="/app/records/purge-approvals" className="text-primary hover:underline">
                    Purge approvals
                  </Link>
                  . You can cancel it there if the file was wrong.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {done.lent ?? 0} record{done.lent === 1 ? "" : "s"} lent.
                </p>
                {done.requestNumber && (
                  <p className="text-muted-foreground text-sm">
                    The loans are on{" "}
                    <Link href={`/app/record-requests/${done.requestId}`} className="text-primary hover:underline">
                      {done.requestNumber}
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Client and template</CardTitle>
          <CardDescription>A file is for one client. Columns: {RECORD_PURGE_COLUMNS.map((c) => c.header).join(", ")}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="pg-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v ?? "")
                setExpedienteChoice("")
                setContactEmail("")
                setContactName("")
                reset()
                setDone(null)
              }}
            >
              <SelectTrigger id="pg-client">
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
          {expedientes.length > 0 && (
            <Field>
              <FieldLabel htmlFor="pg-file">File (optional — fills the File column)</FieldLabel>
              <Select value={expedienteChoice} onValueChange={(v) => setExpedienteChoice(v ?? "")}>
                <SelectTrigger id="pg-file">
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
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="pg-rows">Empty rows to add</FieldLabel>
              <Input id="pg-rows" type="number" min={0} max={MAX_RECORD_PURGE_ROWS} value={blankRows} onChange={(e) => setBlankRows(e.target.value)} />
            </Field>
            {client ? (
              <TemplateDownload name={templateName} rows={templateRows} />
            ) : (
              <Button variant="outline" disabled>
                Template (Excel)
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Action is <span className="font-medium">purge</span> or <span className="font-medium">loan</span>. Date is dd/mm/yyyy and can&apos;t be in
            the future. The example row (internal code 1000000) must be deleted or replaced. At most {MAX_RECORD_PURGE_ROWS} rows per file.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="pg-upload">Excel or CSV file</FieldLabel>
            <input id="pg-upload" ref={fileInput} type="file" accept={SPREADSHEET_ACCEPT} disabled={!client} onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
            {!client && <p className="text-muted-foreground text-xs">Choose the client in step 1 first.</p>}
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} filled-in row{rows.length === 1 ? "" : "s"} read — {purgeRows} to purge, {loanRows} to lend
              {rows.length - purgeRows - loanRows > 0 ? `, ${rows.length - purgeRows - loanRows} with an Action to fix` : ""}.
              {checked && " All rows checked."}
            </p>
          )}
        </CardContent>
      </Card>

      {loanRows > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3 · The loan request</CardTitle>
            <CardDescription>The {loanRows} loan row{loanRows === 1 ? "" : "s"} become one record request.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pg-contact">Contact</FieldLabel>
              {contacts.length > 0 ? (
                <Select
                  value={contactEmail}
                  onValueChange={(email) => {
                    setContactEmail(email ?? "")
                    setContactName(contacts.find((c) => c.email === email)?.name ?? "")
                  }}
                >
                  <SelectTrigger id="pg-contact">
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
                <p className="text-muted-foreground text-xs">{clientContacts.isLoading ? "Loading contacts…" : "No contact with an email in DocuSoft — the request is saved without one."}</p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="pg-loan">Loan type</FieldLabel>
              <Select value={loanType} onValueChange={(v) => setLoanType(v ?? "normal")}>
                <SelectTrigger id="pg-loan">
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
          </CardContent>
        </Card>
      )}

      {rowErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} to fix — nothing was changed
            </CardTitle>
            <CardDescription>Row numbers are the rows of your file (the header is row 1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="max-h-72 divide-y overflow-auto rounded-xl border text-sm">
              {rowErrors.map((e, i) => (
                <li key={`${e.row}-${i}`} className="flex gap-3 px-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">Row {e.row}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("purge-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])}>
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!canSend} onClick={() => send(true)}>
          Check file
        </Button>
        <Button disabled={!canSend || !checked || needsContact} onClick={() => setConfirming(true)}>
          {purgeRows > 0 ? `Send ${purgeRows} purge${purgeRows === 1 ? "" : "s"}${loanRows > 0 ? ` + ${loanRows} loan${loanRows === 1 ? "" : "s"}` : ""} for approval` : loanRows > 0 ? `Lend ${loanRows}` : "Send file"}
        </Button>
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem) && (
          <Button variant="ghost" disabled={run.isPending} onClick={() => { reset(); setDone(null) }}>
            Clear
          </Button>
        )}
        {needsContact && <span className="text-muted-foreground text-sm">Choose the contact for the loan.</span>}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={purgeRows > 0 ? `Send ${purgeRows} purge${purgeRows === 1 ? "" : "s"} for approval?` : `Lend ${loanRows} record${loanRows === 1 ? "" : "s"}?`}
        confirmLabel={purgeRows > 0 ? "Send for approval" : "Lend"}
        description={
          purgeRows > 0 ? (
            <span className="block space-y-2">
              <span className="block">
                <b>Nothing is destroyed yet.</b> A different person with approval rights must approve this file first; whoever approves it destroys these records for good (it can&apos;t be undone). {loanRows > 0 ? `The ${loanRows} loan row${loanRows === 1 ? "" : "s"} go on a loan request at the same time. ` : ""}The records:
              </span>
              <span className="bg-muted block max-h-40 overflow-auto rounded-md p-2 text-xs">
                {rows
                  .filter((r) => isPurgeAction(r.action))
                  .slice(0, 15)
                  .map((r) => (
                    <span key={r.row} className="block">
                      <span className="font-mono">{r.internalCode}</span> — authorised by {r.authorisedBy} on {r.date}
                    </span>
                  ))}
                {purgeRows > 15 && <span className="block">… and {purgeRows - 15} more</span>}
              </span>
            </span>
          ) : (
            "They go on one record request."
          )
        }
        onConfirm={() => send(false)}
      />
    </div>
  )
}
