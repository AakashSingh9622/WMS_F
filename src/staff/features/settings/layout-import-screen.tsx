"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useImportLayout, type LayoutImportResult, type LayoutRow } from "@/api/layoutImport"
import { useBoxLengths, useBoxSizes } from "@/api/settings"
import { useWarehouse } from "@/api/warehouses"
import { Download } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TemplateDownload } from "@/components/template-download"
import { downloadCsv } from "@/lib/csv"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"

const MAX_ROWS = 2000
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")
const COLUMNS: { key: keyof LayoutRow; header: string; names: string[]; example: string; optional?: boolean }[] = [
  { key: "site", header: "Site", names: ["site", "sede", "headoffice"], example: "Head office", optional: true },
  { key: "warehouse", header: "Warehouse", names: ["warehouse", "almacen"], example: "North Warehouse" },
  { key: "floor", header: "Floor", names: ["floor", "planta", "block"], example: "00" },
  { key: "aisle", header: "Aisle", names: ["aisle", "pasillo", "corridor"], example: "01" },
  { key: "module", header: "Module", names: ["module", "modulo", "shelvingunit", "rack"], example: "1310" },
  { key: "shelf", header: "Shelf", names: ["shelf", "balda", "row"], example: "1" },
]

/** `target`: the warehouse this import is for (opened from its page) — the Warehouse column is then optional and, when filled, must be it. */
function toRows(
  grid: string[][],
  target?: { name: string; code: string },
): { rows: LayoutRow[]; problem?: string; rowErrors?: { row: number; message: string }[] } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = COLUMNS.map((c) => head.findIndex((h) => c.names.includes(norm(h))))
  const missing = COLUMNS.filter((c, i) => !(c.optional || (c.key === "warehouse" && target)) && at[i] < 0).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }
  // The boxes template has the same location columns, so it passes the check above. Say so, instead of a row of "empty" errors.
  const heads = head.map(norm)
  if (heads.includes("description") && heads.includes("filingfrom")) {
    return {
      rows: [],
      problem:
        "This is the boxes template (it has Description and Filing from columns), not a layout file. To add boxes use Find a box → Import from a file. To build a warehouse, download the layout template in step 1.",
    }
  }
  // Blank rows at the end (Excel keeps formatted empty rows) are not shelves; ignore them.
  const isBlank = (cells: string[]) => !COLUMNS.some((_, i) => at[i] >= 0 && (cells[at[i]] ?? "").trim() !== "")
  while (body.length > 0 && isBlank(body[body.length - 1])) body.pop()
  if (body.length === 0) return { rows: [], problem: "The file has a header but no shelf rows. Fill in Floor, Aisle, Module and Shelf for each shelf." }
  if (body.length > MAX_ROWS) return { rows: [], problem: `At most ${MAX_ROWS} rows per file — split it.` }
  const rows = body.map((cells) => Object.fromEntries(COLUMNS.map((c, i) => [c.key, (at[i] >= 0 ? (cells[at[i]] ?? "") : "").trim()])) as unknown as LayoutRow)
  if (target) {
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const wrong: { row: number; message: string }[] = []
    rows.forEach((r, i) => {
      if (!r.warehouse) r.warehouse = target.name
      else if (!same(r.warehouse, target.name) && !same(r.warehouse, target.code)) {
        wrong.push({
          row: i + 2,
          message: `This row is for the warehouse "${r.warehouse}", but you are importing into ${target.name} (${target.code}). Change the Warehouse cell to ${target.name}, leave it empty, or open Import layout from the right warehouse.`,
        })
      }
    })
    if (wrong.length) return { rows: [], rowErrors: wrong }
  }
  return { rows }
}

/** Settings → Import layout (Docbox "Importación de Almacén"): a whole warehouse from a sheet, one row per shelf. */
export function LayoutImportScreen() {
  const importLayout = useImportLayout()
  // Opened from a warehouse page (?warehouse=<id>): the layout goes into that warehouse.
  const targetId = useSearchParams().get("warehouse") ?? ""
  const { data: target, isLoading: loadingTarget } = useWarehouse(targetId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<LayoutRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [columns, setColumns] = useState("4")
  const lengths = useBoxLengths()
  const standardCm = lengths.standard ?? 45
  // A box takes one whole position, so a position must be at least as long as the biggest box meant to go there.
  const biggest = useBoxSizes().filter((s) => s.active).reduce((best, s) => (s.lengthCm > best.lengthCm ? s : best), { name: "Standard", lengthCm: standardCm })
  const [cellLength, setCellLength] = useState("") // empty = long enough for the biggest box size
  const cellText = cellLength || String(biggest.lengthCm)
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState<LayoutImportResult | null>(null)
  const [done, setDone] = useState<LayoutImportResult | null>(null)

  const cols = Number(columns)
  const cell = Number(cellText)
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
    try {
      const parsed = toRows(await readTable(file), target ? { name: target.name, code: target.code } : undefined)
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
      if (parsed.rowErrors) setRowErrors(parsed.rowErrors)
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
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
        <h2 className="text-base font-semibold">Warehouse layout</h2>
        <p className="text-muted-foreground text-sm">
          Build a whole warehouse from an Excel (.xlsx) or CSV file — one row per shelf. Everything is checked first; a file with a problem creates nothing.{" "}
          To add or change one module, or to block a slot, open it from{" "}
          <Link href="/app/warehouses" className="text-primary underline-offset-4 hover:underline">
            Warehouses
          </Link>
          .
        </p>
      </div>

      {targetId && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
            <p>
              {loadingTarget ? "Loading the warehouse…" : target ? (
                <>
                  Importing into <span className="font-semibold">{target.name} ({target.code})</span>. The Warehouse column in the file is optional; if you fill it, it must be this warehouse.
                </>
              ) : "That warehouse wasn't found — open Import layout from a warehouse page again."}
            </p>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/settings/layout-import" />}>
              Import into a different warehouse
            </Button>
          </CardContent>
        </Card>
      )}

      {done && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">
              Created: {done.zones} floor{done.zones === 1 ? "" : "s"}, {done.aisles} aisle{done.aisles === 1 ? "" : "s"}, {done.racks} module
              {done.racks === 1 ? "" : "s"} and {done.shelves} shelves in {done.warehouses} warehouse{done.warehouses === 1 ? "" : "s"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {done.targets.map((t) => (
                <Button key={t.id ?? t.name} variant="outline" size="sm" nativeButton={false} render={<Link href={t.id ? `/app/warehouses/${t.id}` : "/app/warehouses"} />}>
                  See it in {t.name}{t.code ? ` (${t.code})` : ""}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Template</CardTitle>
          <CardDescription>
            Site (optional — the head office the warehouse belongs to) → Warehouse (made if it doesn&apos;t exist) → Floor (Block / Floor) → Aisle → Module (Shelving unit, saved with the code M&lt;module&gt;) → Shelf (a row of the module; a module&apos;s
            shelves must be 1…N). A module code can only exist once across all warehouses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateDownload
            name="layout-template"
            rows={[COLUMNS.map((c) => c.header), ...[1, 2, 3].map((s) => COLUMNS.map((c) => (c.key === "shelf" ? String(s) : c.key === "warehouse" && target ? target.name : c.example)))]}
          />
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
              <Input id="li-cell" type="number" min={1} max={1000} value={cellText} onChange={(e) => (setCellLength(e.target.value), setChecked(null))} />
            </Field>
          </div>
          <FieldDescription>Not in the sheet, so they apply to every module. A standard box is {standardCm} cm and the biggest ({biggest.name}) is {biggest.lengthCm} cm. A box takes one whole position, so make it at least as long as the biggest box you want to store there.</FieldDescription>
          <Field>
            <FieldLabel htmlFor="li-file">Excel or CSV file</FieldLabel>
            <input id="li-file" ref={fileInput} type="file" disabled={!!targetId && !target} accept={SPREADSHEET_ACCEPT} onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} shelf row{rows.length === 1 ? "" : "s"} read.
              {checked &&
                ` Checked: ${checked.racks} module${checked.racks === 1 ? "" : "s"}, ${checked.shelves} shelves, ${checked.aisles} aisle${checked.aisles === 1 ? "" : "s"}, ${checked.zones} floor${checked.zones === 1 ? "" : "s"} — ready to create${checked.targets.length ? ` in ${checked.targets.map((t) => `${t.name}${t.isNew ? " (new warehouse)" : ""}`).join(", ")}` : ""}.`}
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
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem || done) && (
          <Button
            variant="ghost"
            disabled={importLayout.isPending}
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
