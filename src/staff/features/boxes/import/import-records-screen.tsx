"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { useImportArchiveRecords } from "@/api/archiveRecords"
import { ApiError } from "@/api/client"
import { useCustomFields } from "@/api/customFields"
import { useExpedientes } from "@/api/expedientes"
import { Download, PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { TemplateDownload } from "@/components/template-download"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAX_RECORD_IMPORT_ROWS, RECORD_IMPORT_COLUMNS, parseRecordImportGrid, recordTemplateRows, type RecordImportRow } from "@/domain/record-import"
import { downloadCsv } from "@/lib/csv"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

/**
 * Import records from a file (Docbox "Generar Plantillas de Importación" + "Entradas a Almacén"): make the Excel template
 * for one client and file, fill it in, check it, import it. All rows are imported or none.
 */
export function ImportRecordsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const importRecords = useImportArchiveRecords()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [blankRows, setBlankRows] = useState("100")
  const [fileName, setFileName] = useState("")
  const [grid, setGrid] = useState<string[][] | null>(null) // the file as cells, read again if the client's fields change
  const [rows, setRows] = useState<RecordImportRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState(false)
  const [done, setDone] = useState<{ count: number; firstCode?: number; lastCode?: number } | null>(null)

  const client = clients?.find((c) => c.ClientId === clientId)
  const { data: expedientes = [] } = useExpedientes(clientId)
  const [expedienteChoice, setExpedienteChoice] = useState("")
  const expedienteId = expedientes.some((e) => e.id === expedienteChoice) ? expedienteChoice : expedientes.length === 1 ? expedientes[0].id : ""
  const expediente = expedientes.find((e) => e.id === expedienteId)
  const needsExpediente = expedientes.length > 0 && !expedienteId
  const { data: customFields = [] } = useCustomFields(clientId, { expedienteId: expedienteId || undefined })

  const ready = !!client && !needsExpediente
  const templateRows = recordTemplateRows({
    fields: customFields,
    clientId,
    expedienteCode: expediente?.code ?? "",
    blankRows: Number(blankRows),
  })
  // Docbox names the file <expediente>-<client>.xlsx
  const templateName = `${expediente?.code ? `${expediente.code}-` : ""}${clientId || "records"}-records-template`

  const reset = () => {
    setFileName("")
    setGrid(null)
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
      const table = await readTable(file)
      setGrid(table)
      const parsed = parseRecordImportGrid(table, customFields)
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  // Another client or file (or its fields loading late) changes which columns count: read the same file again.
  const [readFor, setReadFor] = useState("")
  const readKey = `${clientId}:${expedienteId}:${customFields.map((f) => f.code + f.name + f.required).join("|")}`
  if (grid && readFor !== readKey) {
    setReadFor(readKey)
    const parsed = parseRecordImportGrid(grid, customFields)
    setRows(parsed.rows)
    setFileProblem(parsed.problem ?? "")
    setRowErrors([])
    setChecked(false)
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    importRecords.mutate(
      { clientId: client.ClientId, clientName: client.Client, expedienteId: expedienteId || undefined, dryRun, rows },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${result.count} rows look good.`)
          } else {
            setDone({ count: result.count, firstCode: result.firstCode, lastCode: result.lastCode })
            reset()
            toast.success(`${result.count} record${result.count === 1 ? "" : "s"} imported.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "Import failed")
        },
      },
    )
  }

  const downloadErrors = () => downloadCsv("import-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])
  const canSend = ready && rows.length > 0 && !importRecords.isPending

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Import records from a file"
        description="Records are the individual files inside a box, each with its own internal code. Make the Excel template for a client and file here, fill it in, check it, then import it. Every row is checked first — if one is wrong, nothing is imported."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/import" />}>
            Import boxes instead
          </Button>
        }
      />

      {done && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">
              {done.count} record{done.count === 1 ? "" : "s"} imported.
            </p>
            {done.firstCode !== undefined && (
              <p className="text-muted-foreground text-sm">
                Internal codes {done.firstCode}
                {done.lastCode !== undefined && done.lastCode !== done.firstCode ? `–${done.lastCode}` : ""}. Open a box and its Records tab to see them.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Client and file</CardTitle>
          <CardDescription>The template carries this client&apos;s own fields as its first columns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="rt-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger id="rt-client">
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
              <FieldLabel htmlFor="rt-expediente">File (expediente)</FieldLabel>
              <Select value={expedienteId} onValueChange={(v) => setExpedienteChoice(v ?? "")}>
                <SelectTrigger id="rt-expediente">
                  <SelectValue
                    placeholder="Choose the file"
                    getLabel={(id) => {
                      const e = expedientes.find((x) => x.id === id)
                      return e ? `${e.code} — ${e.description}` : id
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  {expedientes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.code} — {e.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">The template uses this file&apos;s own fields, and only this file&apos;s boxes are accepted.</p>
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Template</CardTitle>
          <CardDescription>
            One row per record.{" "}
            {ready
              ? customFields.length > 0
                ? `Columns: ${customFields.map((f) => f.name + (f.required ? " (mandatory)" : "")).join(", ")}, then ${RECORD_IMPORT_COLUMNS.map((c) => c.header).join(", ")}.`
                : `This client has no fields of its own, so the columns are: ${RECORD_IMPORT_COLUMNS.map((c) => c.header).join(", ")}.`
              : "Choose the client (and file) first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">Box No.</span> says which box each record goes into — the box must already be
            registered and belong to this client. File and Customer are filled in for you and must match the box. The location, NCE,
            TYPECE, pallet and Box Type columns describe the box; they are read for a file made in Docbox but never change the box.
            Rows you leave empty are skipped, and the example row (Box No. BX00000000) must be deleted or filled in.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="rt-rows">Empty rows to add</FieldLabel>
              <Input
                id="rt-rows"
                type="number"
                min={0}
                max={MAX_RECORD_IMPORT_ROWS}
                value={blankRows}
                onChange={(e) => setBlankRows(e.target.value)}
              />
            </Field>
            {ready ? (
              <TemplateDownload name={templateName} rows={templateRows} />
            ) : (
              <Button variant="outline" disabled>
                Template (Excel)
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">At most {MAX_RECORD_IMPORT_ROWS} rows per file.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="rt-file">Excel or CSV file</FieldLabel>
            <input
              id="rt-file"
              ref={fileInput}
              type="file"
              accept={SPREADSHEET_ACCEPT}
              disabled={!ready}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm"
            />
            {!ready && <p className="text-muted-foreground text-xs">Choose the client (and file) in step 1 first.</p>}
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} filled-in row{rows.length === 1 ? "" : "s"} read.
              {checked && " All rows checked — ready to import."}
            </p>
          )}
        </CardContent>
      </Card>

      {rowErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} to fix — nothing was imported
            </CardTitle>
            <CardDescription>Row numbers are the rows of your file (the header is row 1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="max-h-72 divide-y overflow-auto rounded-xl border text-sm">
              {rowErrors.map((e) => (
                <li key={e.row} className="flex gap-3 px-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">Row {e.row}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={downloadErrors}>
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" disabled={!canSend} onClick={() => send(true)}>
          Check file
        </Button>
        <Button disabled={!canSend || !checked} onClick={() => send(false)}>
          Import {rows.length > 0 ? `${rows.length} record${rows.length === 1 ? "" : "s"}` : ""}
        </Button>
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem || done) && (
          <Button
            variant="ghost"
            disabled={importRecords.isPending}
            onClick={() => {
              reset()
              setDone(null)
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
