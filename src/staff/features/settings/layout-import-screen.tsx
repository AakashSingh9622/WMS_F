"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useImportLayout, type LayoutImportResult, type LayoutRow } from "@/api/layoutImport"
import { Download } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { downloadCsv, parseCsv } from "@/lib/csv"

const MAX_ROWS = 2000
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")
const COLUMNS: { key: keyof LayoutRow; header: string; names: string[]; example: string }[] = [
  { key: "warehouse", header: "Warehouse", names: ["warehouse", "almacen", "site"], example: "North Warehouse" },
  { key: "floor", header: "Floor", names: ["floor", "planta", "block"], example: "00" },
  { key: "aisle", header: "Aisle", names: ["aisle", "pasillo", "corridor"], example: "01" },
  { key: "module", header: "Module", names: ["module", "modulo", "shelvingunit", "rack"], example: "1310" },
  { key: "shelf", header: "Shelf", names: ["shelf", "balda", "row"], example: "1" },
]

function toRows(grid: string[][]): { rows: LayoutRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = COLUMNS.map((c) => head.findIndex((h) => c.names.includes(norm(h))))
  const missing = COLUMNS.filter((_, i) => at[i] < 0).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }
  if (body.length === 0) return { rows: [], problem: "The file has a header but no rows." }
  if (body.length > MAX_ROWS) return { rows: [], problem: `At most ${MAX_ROWS} rows per file — split it.` }
  return {
    rows: body.map((cells) => Object.fromEntries(COLUMNS.map((c, i) => [c.key, (cells[at[i]] ?? "").trim()])) as unknown as LayoutRow),
  }
}

/** Settings → Import layout (Docbox "Importación de Almacén"): a whole warehouse from a sheet, one row per shelf. */
export function LayoutImportScreen() {
  const importLayout = useImportLayout()
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<LayoutRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [columns, setColumns] = useState("4")
  const [cellLength, setCellLength] = useState("45")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState<LayoutImportResult | null>(null)
  const [done, setDone] = useState<LayoutImportResult | null>(null)

  const cols = Number(columns)
  const cell = Number(cellLength)
  const paramsOk = Number.isInteger(cols) && cols >= 1 && cols <= 50 && Number.isInteger(cell) && cell >= 1 && cell <= 1000

  const reset = () => {
    setFileName("")
    setRows([])
    setFileProblem("")
    setRowErrors([])
    setChecked(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  async function onFile(file: File | undefined) {
    reset()
    setDone(null)
    if (!file) return
    setFileName(file.name)
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileProblem("Save the sheet as CSV first (Excel: File → Save As → CSV UTF-8), then choose it here.")
      return
    }
    const parsed = toRows(parseCsv(await file.text()))
    setRows(parsed.rows)
    setFileProblem(parsed.problem ?? "")
  }

  const send = (dryRun: boolean) => {
    setRowErrors([])
    importLayout.mutate(
      { rows, columns: cols, cellLengthCm: cell, dryRun },
      {
        onSuccess: (r) => {
          if (dryRun) setChecked(r)
          else {
            setDone(r)
            reset()
            toast.success("Layout created")
          }
        },
        onError: (err) => {
          setChecked(null)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "Import failed")
        },
      }
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Import layout</h2>
        <p className="text-muted-foreground text-sm">
          Build a whole warehouse from a spreadsheet saved as CSV — one row per shelf. Everything is checked first; a file with a problem creates nothing.
        </p>
      </div>

      {done && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">
              Created: {done.zones} floor{done.zones === 1 ? "" : "s"}, {done.aisles} aisle{done.aisles === 1 ? "" : "s"}, {done.racks} rack
              {done.racks === 1 ? "" : "s"} and {done.shelves} shelves in {done.warehouses} warehouse{done.warehouses === 1 ? "" : "s"}.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Template</CardTitle>
          <CardDescription>
            Warehouse (made if it doesn&apos;t exist) → Floor (a zone) → Aisle → Module (a rack, named M&lt;module&gt;) → Shelf (a row of the rack; a module&apos;s
            shelves must be 1…N). A rack code can only exist once across all warehouses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("layout-template.csv", [
                COLUMNS.map((c) => c.header),
                ...[1, 2, 3].map((s) => COLUMNS.map((c) => (c.key === "shelf" ? String(s) : c.example))),
              ])
            }
          >
            <Download /> Download template (CSV)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Sizes and file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="li-cols">Positions on each shelf</FieldLabel>
              <Input id="li-cols" type="number" min={1} max={50} value={columns} onChange={(e) => (setColumns(e.target.value), setChecked(null))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="li-cell">Length of one position (cm)</FieldLabel>
              <Input id="li-cell" type="number" min={1} max={1000} value={cellLength} onChange={(e) => (setCellLength(e.target.value), setChecked(null))} />
            </Field>
          </div>
          <FieldDescription>Not in the sheet, so they apply to every rack. A standard box is 45 cm.</FieldDescription>
          <Field>
            <FieldLabel htmlFor="li-file">CSV file</FieldLabel>
            <input id="li-file" ref={fileInput} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} shelf row{rows.length === 1 ? "" : "s"} read.
              {checked &&
                ` Checked: ${checked.racks} rack${checked.racks === 1 ? "" : "s"}, ${checked.shelves} shelves, ${checked.aisles} aisle${checked.aisles === 1 ? "" : "s"}, ${checked.zones} floor${checked.zones === 1 ? "" : "s"} — ready to create.`}
            </p>
          )}
        </CardContent>
      </Card>

      {rowErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {rowErrors.length} problem{rowErrors.length === 1 ? "" : "s"} to fix — nothing was created
            </CardTitle>
            <CardDescription>Row numbers are the rows of your file (the header is row 1). Row 0 means the problem is about a whole module.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="max-h-72 divide-y overflow-auto rounded-xl border text-sm">
              {rowErrors.map((e, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">{e.row > 0 ? `Row ${e.row}` : "Module"}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("layout-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])}>
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" disabled={rows.length === 0 || !paramsOk || importLayout.isPending} onClick={() => send(true)}>
          Check file
        </Button>
        <Button disabled={rows.length === 0 || !paramsOk || !checked || importLayout.isPending} onClick={() => send(false)}>
          Create layout
        </Button>
      </div>
    </div>
  )
}
