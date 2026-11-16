"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useBulkMove, type BulkMoveRow } from "@/api/boxes"
import { Download, ArrowRight } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { downloadCsv, parseCsv } from "@/lib/csv"

const MAX_ROWS = 500
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")
const BOX_HEADERS = ["box", "boxnumber", "barcode", "boxbarcode", "internalcode", "codinterno"]
const LOCATION_HEADERS = ["location", "newlocation", "shelf", "position", "ubicacion"]

function toRows(grid: string[][]): { rows: BulkMoveRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const box = head.findIndex((h) => BOX_HEADERS.includes(norm(h)))
  const location = head.findIndex((h) => LOCATION_HEADERS.includes(norm(h)))
  if (box < 0 || location < 0) return { rows: [], problem: "The file needs the columns Box and Location. Use the template." }
  if (body.length === 0) return { rows: [], problem: "The file has a header but no rows." }
  if (body.length > MAX_ROWS) return { rows: [], problem: `At most ${MAX_ROWS} rows per file — split it.` }
  return { rows: body.map((c) => ({ box: (c[box] ?? "").trim(), location: (c[location] ?? "").trim() })) }
}

/** Change the location of many boxes from a CSV file (Docbox "Cambio de Ubicación"): checked first, then all or nothing. */
export function BulkMoveScreen() {
  const move = useBulkMove()
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<BulkMoveRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [reason, setReason] = useState("")
  const [checked, setChecked] = useState(false)
  const [done, setDone] = useState<number | null>(null)

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
    move.mutate(
      { rows, dryRun, reason: reason.trim() || undefined },
      {
        onSuccess: (r) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${r.count} moves look good.`)
          } else {
            setDone(r.count)
            reset()
            toast.success(`${r.count} boxes moved.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "Move failed")
        },
      }
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={ArrowRight}
        title="Move boxes from a file"
        description="Change the shelf of many boxes at once from a spreadsheet saved as CSV. Every row is checked first — if one is wrong, nothing moves."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes" />}>
            Find a box
          </Button>
        }
      />

      {done !== null && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">{done} boxes moved. Each one has a history entry.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Template</CardTitle>
          <CardDescription>
            One row per box. <b>Box</b> is the barcode or box number. <b>Location</b> is the new shelf or position, like
            A-1 (rack A, shelf 1) or A-1-3 (also position 3). A shelf picks the first position with room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => downloadCsv("box-move-template.csv", [["Box", "Location"], ["BX00000001", "A-1"]])}
          >
            <Download /> Download template (CSV)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="mv-file">CSV file</FieldLabel>
            <input
              id="mv-file"
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mv-reason">Reason (optional)</FieldLabel>
            <Input id="mv-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} read.
              {checked && " All rows checked — ready to move."}
            </p>
          )}
        </CardContent>
      </Card>

      {rowErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} to fix — nothing was moved
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv("move-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])}
            >
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" disabled={rows.length === 0 || move.isPending} onClick={() => send(true)}>
          Check file
        </Button>
        <Button disabled={rows.length === 0 || !checked || move.isPending} onClick={() => send(false)}>
          Move {rows.length > 0 ? `${rows.length} boxes` : ""}
        </Button>
      </div>
    </div>
  )
}
