"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useImportBoxes, type ImportBoxRow } from "@/api/boxes"
import { useCustomFields, type CustomField } from "@/api/customFields"
import { Download, PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { downloadCsv, parseCsv } from "@/lib/csv"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const MAX_ROWS = 500

// Column headers of the template (the file's first row). Matching ignores case, spaces and underscores.
const COLUMNS: { key: keyof ImportBoxRow; header: string; required?: boolean; example: string }[] = [
  { key: "description", header: "Description", required: true, example: "Block 1 - housing plans" },
  { key: "department", header: "Department", example: "Planning" },
  { key: "reference", header: "Reference", example: "REF-001" },
  { key: "filingDateFrom", header: "Filing from", required: true, example: "2026-01-01" },
  { key: "filingDateTo", header: "Filing to", example: "2026-06-30" },
  { key: "destroyAfter", header: "Destroy after", example: "2033-06-30" },
  { key: "retentionCategory", header: "Retention category", example: "" },
  { key: "palletNo", header: "Pallet number", example: "" },
  { key: "size", header: "Size", example: "standard" },
]
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")

function toRows(grid: string[][], fields: CustomField[]): { rows: ImportBoxRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const index = new Map<keyof ImportBoxRow, number>()
  for (const col of COLUMNS) {
    const at = head.findIndex((h) => norm(h) === norm(col.header) || norm(h) === norm(col.key))
    if (at >= 0) index.set(col.key, at)
  }
  // The client's own fields: a column named like the field (or its code, C1 …). Mandatory ones must have a column.
  const customIndex = new Map<string, number>()
  for (const f of fields) {
    const at = head.findIndex((h) => norm(h) === norm(f.name) || norm(h) === norm(f.code))
    if (at >= 0) customIndex.set(f.code, at)
  }
  const missingCustom = fields.filter((f) => f.required && !customIndex.has(f.code)).map((f) => f.name)
  if (missingCustom.length) {
    return { rows: [], problem: `Missing column${missingCustom.length > 1 ? "s" : ""}: ${missingCustom.join(", ")}. Download the template again.` }
  }
  const missing = COLUMNS.filter((c) => c.required && !index.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }
  if (body.length === 0) return { rows: [], problem: "The file has a header but no rows." }
  if (body.length > MAX_ROWS) return { rows: [], problem: `At most ${MAX_ROWS} rows per file — split it.` }
  const rows = body.map((cells) => {
    const row: Record<string, string> = {}
    for (const [key, at] of index) row[key] = (cells[at] ?? "").trim()
    const custom: Record<string, string> = {}
    for (const [code, at] of customIndex) custom[code] = (cells[at] ?? "").trim()
    return { ...row, customFields: custom } as unknown as ImportBoxRow
  })
  return { rows }
}

/** Bulk-register boxes from a CSV file (Docbox "Entradas a Almacén"): check first, then import all or nothing. */
export function ImportBoxesScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const importBoxes = useImportBoxes()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<ImportBoxRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState(false)
  const [doneCount, setDoneCount] = useState<number | null>(null)

  const client = clients?.find((c) => c.ClientId === clientId)
  const { data: customFields = [] } = useCustomFields(clientId)
  const [fileText, setFileText] = useState("")

  const reset = () => {
    setFileName("")
    setRows([])
    setFileProblem("")
    setRowErrors([])
    setChecked(false)
    setFileText("")
    if (fileInput.current) fileInput.current.value = ""
  }

  const onFile = async (file: File | undefined) => {
    reset()
    setDoneCount(null)
    if (!file) return
    setFileName(file.name)
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileProblem("Save the sheet as CSV first (Excel: File → Save As → CSV UTF-8), then choose it here.")
      return
    }
    const content = await file.text()
    setFileText(content)
    const parsed = toRows(parseCsv(content), customFields)
    setRows(parsed.rows)
    setFileProblem(parsed.problem ?? "")
  }

  // Another client (or its fields loading late) changes which columns count: read the same file again.
  const [readFor, setReadFor] = useState("")
  const readKey = `${clientId}:${customFields.map((f) => f.code + f.name + f.required).join("|")}`
  if (fileText && readFor !== readKey) {
    setReadFor(readKey)
    const parsed = toRows(parseCsv(fileText), customFields)
    setRows(parsed.rows)
    setFileProblem(parsed.problem ?? "")
    setRowErrors([])
    setChecked(false)
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    importBoxes.mutate(
      { clientId: client.ClientId, clientName: client.Client, rows, dryRun },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${result.count} rows look good.`)
          } else {
            setDoneCount(result.count)
            reset()
            toast.success(`${result.count} boxes registered.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "Import failed")
        },
      }
    )
  }

  const downloadTemplate = () =>
    downloadCsv("box-import-template.csv", [
      [...COLUMNS.map((c) => c.header), ...customFields.map((f) => f.name)],
      [...COLUMNS.map((c) => c.example), ...customFields.map((f) => (f.fieldType === "date" ? "2026-01-01" : f.fieldType === "number" ? "1" : ""))],
    ])

  const downloadErrors = () =>
    downloadCsv("import-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Import boxes from a file"
        description="Register many boxes at once from a spreadsheet saved as CSV. Every row is checked first — if one is wrong, nothing is imported."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/new" />}>
            Register one batch instead
          </Button>
        }
      />

      {doneCount !== null && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <p className="flex-1 font-medium">{doneCount} boxes registered. They are waiting to be put on shelves.</p>
            <Button variant="outline" nativeButton={false} render={<Link href="/app/boxes?status=unallocated" />}>
              Show unallocated boxes
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Template</CardTitle>
          <CardDescription>
            One row per box. Required: Description and Filing from (YYYY-MM-DD or DD/MM/YYYY). Retention category must
            exist under Records → Retention rules; Size is a box size name from Settings.
            {customFields.length > 0
              ? ` This client's own fields are added as columns: ${customFields.map((f) => f.name + (f.required ? " (mandatory)" : "")).join(", ")}.`
              : " Choose the client below first to include its own fields in the template."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download /> Download template (CSV)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Client and file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="imp-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger id="imp-client">
                <SelectValue
                  placeholder="Choose a client"
                  getLabel={(id) => clients?.find((c) => c.ClientId === id)?.Client ?? id}
                />
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
          <Field>
            <FieldLabel htmlFor="imp-file">CSV file</FieldLabel>
            <input
              id="imp-file"
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm"
            />
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} read.
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
        <Button
          variant="outline"
          disabled={!client || rows.length === 0 || importBoxes.isPending}
          onClick={() => send(true)}
        >
          Check file
        </Button>
        <Button disabled={!client || rows.length === 0 || !checked || importBoxes.isPending} onClick={() => send(false)}>
          Import {rows.length > 0 ? `${rows.length} boxes` : ""}
        </Button>
      </div>
    </div>
  )
}
