"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, apiClient, parse } from "@/api/client"
import { useExpedientes } from "@/api/expedientes"
import { Download, PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { TemplateDownload } from "@/components/template-download"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAX_RECORD_MOVE_ROWS, RECORD_MOVE_COLUMNS, parseRecordMoveGrid, recordMoveTemplateRows, type RecordMoveRow } from "@/domain/record-move"
import { downloadCsv } from "@/lib/csv"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const resultSchema = z.object({ dryRun: z.boolean(), count: z.number() })

/** Moves archived records to another box of the same client and file. All rows or none; `dryRun` only checks. */
function useMoveRecords() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { clientId: string; clientName: string; dryRun: boolean; rows: RecordMoveRow[] }) =>
      parse(resultSchema, await apiClient.post("/archive-records/move", input)),
    onSuccess: (result) => {
      if (!result.dryRun) void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

/**
 * Docbox "Cambio de ubicación" for records: move records from one box to another by file. A record has no shelf of its own — its
 * place is its box's place — so moving it to another box changes where it is. Every row is checked first; if one is wrong,
 * nothing is moved.
 */
export function MoveRecordsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const move = useMoveRecords()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [blankRows, setBlankRows] = useState("50")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<RecordMoveRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  const client = clients?.find((c) => c.ClientId === clientId)
  const { data: expedientes = [] } = useExpedientes(clientId)
  const [expedienteChoice, setExpedienteChoice] = useState("")
  const expediente = expedientes.find((e) => e.id === expedienteChoice)

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
      const parsed = parseRecordMoveGrid(await readTable(file))
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    move.mutate(
      { clientId: client.ClientId, clientName: client.Client, dryRun, rows },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${result.count} rows look good.`)
          } else {
            setDone(result.count)
            reset()
            toast.success(`${result.count} record${result.count === 1 ? "" : "s"} moved.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "The move failed")
        },
      },
    )
  }

  const templateName = `${expediente?.code ? `${expediente.code}-` : ""}${clientId || "records"}-move-records-template`
  const templateRows = recordMoveTemplateRows({ clientId, expedienteCode: expediente?.code ?? "", blankRows: Number(blankRows) })
  const canSend = !!client && rows.length > 0 && !move.isPending

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Move records to another box"
        description="A record has no shelf of its own — it is in a box, and its place is its box's place. Move records to another box of the same client and file by Excel. Every row is checked first — if one is wrong, nothing is moved. Each record keeps its whole history and gets a “moved” entry."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/import-records" />}>
            Import records instead
          </Button>
        }
      />

      {done !== null && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">
              {done} record{done === 1 ? "" : "s"} moved.
            </p>
            <p className="text-muted-foreground text-sm">Open a box and its Records tab to see them. Each record&apos;s History shows where it came from.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Client and template</CardTitle>
          <CardDescription>A file is for one client. Columns: {RECORD_MOVE_COLUMNS.map((c) => c.header).join(", ")}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="mv-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v ?? "")
                setExpedienteChoice("")
                reset()
                setDone(null)
              }}
            >
              <SelectTrigger id="mv-client">
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
              <FieldLabel htmlFor="mv-file">File (optional — fills the File column)</FieldLabel>
              <Select value={expedienteChoice} onValueChange={(v) => setExpedienteChoice(v ?? "")}>
                <SelectTrigger id="mv-file">
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
              <FieldLabel htmlFor="mv-rows">Empty rows to add</FieldLabel>
              <Input id="mv-rows" type="number" min={0} max={MAX_RECORD_MOVE_ROWS} value={blankRows} onChange={(e) => setBlankRows(e.target.value)} />
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
            <span className="font-medium">New box no.</span> is the box number (or barcode) the record goes to. Only <span className="font-medium">archived</span> records
            can be moved (not one that is on loan), and the new box must belong to the same client and the same file. A box under legal hold, or a
            destroyed one, is refused. The same record can&apos;t be listed twice. The example row (internal code 1000000) must be deleted or replaced.
            At most {MAX_RECORD_MOVE_ROWS} rows per file.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="mv-upload">Excel or CSV file</FieldLabel>
            <input id="mv-upload" ref={fileInput} type="file" accept={SPREADSHEET_ACCEPT} disabled={!client} onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
            {!client && <p className="text-muted-foreground text-xs">Choose the client in step 1 first.</p>}
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} filled-in row{rows.length === 1 ? "" : "s"} read.
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
              {rowErrors.map((e, i) => (
                <li key={`${e.row}-${i}`} className="flex gap-3 px-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">Row {e.row}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("move-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])}>
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
          Move {rows.length > 0 ? `${rows.length} record${rows.length === 1 ? "" : "s"}` : ""}
        </Button>
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem) && (
          <Button variant="ghost" disabled={move.isPending} onClick={() => { reset(); setDone(null) }}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
