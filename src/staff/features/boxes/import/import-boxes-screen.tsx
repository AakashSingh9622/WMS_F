"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useImportBoxes, type ImportBoxRow } from "@/api/boxes"
import { useCustomFields, type CustomField } from "@/api/customFields"
import { useExpedientes } from "@/api/expedientes"
import { Download, PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TemplateDownload } from "@/components/template-download"
import { downloadCsv } from "@/lib/csv"
import { todayISO } from "@/lib/formatting"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const MAX_ROWS = 500

// Column headers of the template (the file's first row). Matching ignores case, accents, spaces and punctuation, and also
// accepts Docbox's own column names (Block/Floor, Rack/Module, Row/Shelf, Pallet No., Box type, Planta, Pasillo, Balda …).
const COLUMNS: { key: keyof ImportBoxRow; header: string; required?: boolean; example: string; aliases?: string[] }[] = [
  { key: "description", header: "Description", required: true, example: "Block 1 - housing plans" },
  { key: "department", header: "Department", example: "Planning" },
  { key: "reference", header: "Reference", example: "REF-001" },
  { key: "filingDateFrom", header: "Filing from", required: true, example: "2026-01-01" },
  { key: "filingDateTo", header: "Filing to", example: "2026-06-30" },
  { key: "destroyAfter", header: "Destroy after", example: "2033-06-30" },
  { key: "retentionCategory", header: "Retention category", example: "" },
  { key: "size", header: "Size", example: "standard", aliases: ["boxtype", "tipocaja"] },
  { key: "palletNo", header: "Pallet number", example: "", aliases: ["palletno", "npalet", "palet"] },
  { key: "containerNo", header: "Container number", example: "", aliases: ["nce", "ncontenedor", "contenedor", "container"] },
  { key: "containerType", header: "Container type", example: "", aliases: ["typece", "tipocontenedor", "tipoce"] },
  { key: "comments", header: "Comments", example: "", aliases: ["observaciones", "observations", "remarks", "notes"] },
  { key: "entryDate", header: "Entry date", example: "", aliases: ["fechaentrada", "dateofentry"] },
  // Location (optional): fill Module and Shelf and the box is put on that shelf when imported.
  { key: "site", header: "Site", example: "", aliases: ["sede", "headoffice"] },
  { key: "warehouse", header: "Warehouse", example: "", aliases: ["almacen"] },
  { key: "floor", header: "Floor", example: "", aliases: ["blockfloor", "block", "planta", "bloqueplanta"] },
  { key: "aisle", header: "Aisle", example: "", aliases: ["corridor", "pasillo"] },
  { key: "module", header: "Module", example: "", aliases: ["rackmodule", "shelvingunitmodule", "shelvingunit", "rack", "estanteriamodulo", "estanteria", "modulo"] },
  { key: "shelf", header: "Shelf", example: "", aliases: ["rowshelf", "row", "fila", "filabalda", "balda"] },
]
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

function toRows(grid: string[][], fields: CustomField[]): { rows: ImportBoxRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const index = new Map<keyof ImportBoxRow, number>()
  for (const col of COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const at = head.findIndex((h) => names.includes(norm(h)))
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
  const [entryDate, setEntryDate] = useState(todayISO)
  const [blankRows, setBlankRows] = useState("0")
  const [doneCount, setDoneCount] = useState<number | null>(null)
  const [donePlaced, setDonePlaced] = useState(0)
  const [placeProblem, setPlaceProblem] = useState("")
  const [checkedPlaced, setCheckedPlaced] = useState(0)

  const client = clients?.find((c) => c.ClientId === clientId)
  // Docbox: a file is imported into one expediente of the client (when the client has any); its own fields are the columns.
  const { data: expedientes = [] } = useExpedientes(clientId)
  const [expedienteChoice, setExpedienteChoice] = useState("")
  const expedienteId = expedientes.some((e) => e.id === expedienteChoice) ? expedienteChoice : expedientes.length === 1 ? expedientes[0].id : ""
  const needsExpediente = expedientes.length > 0 && !expedienteId
  const { data: customFields = [] } = useCustomFields(clientId, { expedienteId: expedienteId || undefined })
  // The file as rows of cells (CSV or Excel), kept so it can be read again when the client's own fields change.
  const [grid, setGrid] = useState<string[][] | null>(null)

  const reset = () => {
    setFileName("")
    setRows([])
    setFileProblem("")
    setRowErrors([])
    setChecked(false)
    setGrid(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const onFile = async (file: File | undefined) => {
    reset()
    setDoneCount(null)
    if (!file) return
    setFileName(file.name)
    try {
      const table = await readTable(file)
      setGrid(table)
      const parsed = toRows(table, customFields)
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  // Another client (or its fields loading late) changes which columns count: read the same file again.
  const [readFor, setReadFor] = useState("")
  const readKey = `${clientId}:${customFields.map((f) => f.code + f.name + f.required).join("|")}`
  if (grid && readFor !== readKey) {
    setReadFor(readKey)
    const parsed = toRows(grid, customFields)
    setRows(parsed.rows)
    setFileProblem(parsed.problem ?? "")
    setRowErrors([])
    setChecked(false)
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    importBoxes.mutate(
      { clientId: client.ClientId, clientName: client.Client, rows, dryRun, entryDate: entryDate || undefined, expedienteId: expedienteId || undefined },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            const placed = result.placed ?? 0
            setCheckedPlaced(placed)
            toast.success(`All ${result.count} rows look good${placed ? ` — ${placed} will be put on shelves.` : "."}`)
          } else {
            const placed = result.placed ?? 0
            setDoneCount(result.count)
            setDonePlaced(placed)
            setPlaceProblem(result.placeProblem ?? "")
            reset()
            toast.success(`${result.count} boxes registered${placed ? `, ${placed} put on shelves` : ""}.`)
            if (result.placeProblem) toast.error(`Some boxes could not be put on their shelf: ${result.placeProblem}`)
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

  const header = [...COLUMNS.map((c) => c.header), ...customFields.map((f) => f.name)]
  const emptyRows = Math.min(500, Math.max(0, Number(blankRows) || 0))
  const templateRows = [
    header,
    [...COLUMNS.map((c) => c.example), ...customFields.map((f) => (f.fieldType === "date" ? "2026-01-01" : f.fieldType === "number" ? "1" : ""))],
    ...Array.from({ length: emptyRows }, () => header.map(() => "")),
  ]

  const downloadErrors = () =>
    downloadCsv("import-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Import boxes from a file"
        description="Register many boxes at once from an Excel (.xlsx) or CSV file. Every row is checked first — if one is wrong, nothing is imported."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/import-records" />}>
              Import records instead
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/new" />}>
              Register one batch instead
            </Button>
          </div>
        }
      />

      {doneCount !== null && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <div className="flex-1">
              <p className="font-medium">
                {doneCount} boxes registered.
                {donePlaced > 0 && ` ${donePlaced} put on their shelves.`}
                {doneCount - donePlaced > 0 && ` ${doneCount - donePlaced} waiting to be put on shelves.`}
              </p>
              {placeProblem && <p className="text-destructive text-sm">Putting boxes on shelves stopped: {placeProblem}. Use Move to place them.</p>}
            </div>
            {doneCount - donePlaced > 0 && (
              <Button variant="outline" nativeButton={false} render={<Link href="/app/boxes?status=unallocated" />}>
                Show unallocated boxes
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Template</CardTitle>
          <CardDescription>
            One row per box. Required: Description and Filing from (YYYY-MM-DD or DD/MM/YYYY). Retention category must
            exist under Records → Retention rules; Size (or Box type) is a box size name from Settings. To shelve the
            boxes straight away fill in Module and Shelf (and optionally Warehouse, Floor, Aisle — they must match
            where the module really is); leave them empty to put the boxes on shelves later. Docbox&apos;s column names
            (Block/Floor, Rack/Module, Row/Shelf, Pallet No.) are understood too.
            {customFields.length > 0
              ? ` This client's own fields are added as columns: ${customFields.map((f) => f.name + (f.required ? " (mandatory)" : "")).join(", ")}.`
              : " Choose the client below first to include its own fields in the template."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="tpl-rows">Empty rows to add</FieldLabel>
              <Input
                id="tpl-rows"
                type="number"
                min={0}
                max={500}
                value={blankRows}
                onChange={(e) => setBlankRows(e.target.value)}
              />
            </Field>
            <TemplateDownload name="box-import-template" rows={templateRows} />
          </div>
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
          {expedientes.length > 0 && (
            <Field>
              <FieldLabel htmlFor="imp-expediente">Expediente</FieldLabel>
              <Select value={expedienteId} onValueChange={(v) => setExpedienteChoice(v ?? "")}>
                <SelectTrigger id="imp-expediente">
                  <SelectValue
                    placeholder="Choose the expediente"
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
              <p className="text-muted-foreground text-xs">The template and the checks use this expediente&apos;s own fields.</p>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="imp-entry">Entry date</FieldLabel>
            <Input id="imp-entry" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="max-w-48" />
            <p className="text-muted-foreground text-xs">The day these boxes came in. A row&apos;s own Entry date column wins over this.</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="imp-file">Excel or CSV file</FieldLabel>
            <input
              id="imp-file"
              ref={fileInput}
              type="file"
              accept={SPREADSHEET_ACCEPT}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm"
            />
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} read.
              {checked && ` All rows checked — ready to import${checkedPlaced ? ` (${checkedPlaced} will be put on shelves)` : ""}.`}
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
          disabled={!client || needsExpediente || rows.length === 0 || importBoxes.isPending}
          onClick={() => send(true)}
        >
          Check file
        </Button>
        <Button disabled={!client || needsExpediente || rows.length === 0 || !checked || importBoxes.isPending} onClick={() => send(false)}>
          Import {rows.length > 0 ? `${rows.length} boxes` : ""}
        </Button>
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem || doneCount !== null) && (
          <Button
            variant="ghost"
            disabled={importBoxes.isPending}
            onClick={() => {
              reset()
              setDoneCount(null)
              setDonePlaced(0)
              setPlaceProblem("")
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
