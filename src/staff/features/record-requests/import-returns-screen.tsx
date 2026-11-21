"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { itemLocation, useImportReturns, type ReturnImportResult } from "@/api/recordReturns"
import { ClipboardList, Download } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { TemplateDownload } from "@/components/template-download"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { locationText } from "@/domain/location"
import {
  MAX_RECORD_RETURN_ROWS,
  RECORD_RETURN_COLUMNS,
  parseRecordReturnGrid,
  recordReturnTemplateRows,
  type RecordReturnRow,
} from "@/domain/record-return-import"
import { downloadCsv } from "@/lib/csv"
import { downloadShelvingExcel, shelvingUrlForIds } from "@/lib/shelving-excel"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

/**
 * Docbox "Importar Devoluciones": return records by file (Excel or CSV with their internal codes) instead of typing or scanning them.
 * Every row is checked first (Check file); if one is wrong, nothing is returned. The result is the same shelving list as the typed
 * return — Print shelving list and Download Excel, in the pick list's walking order (boxes with no location last).
 */
export function ImportReturnsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const importReturns = useImportReturns()
  const fileInput = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState("")
  const [blankRows, setBlankRows] = useState("50")
  const [note, setNote] = useState("")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<RecordReturnRow[]>([])
  const [fileProblem, setFileProblem] = useState("")
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])
  const [checked, setChecked] = useState(false)
  const [done, setDone] = useState<ReturnImportResult | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)

  const client = clients?.find((c) => c.ClientId === clientId)

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
      const parsed = parseRecordReturnGrid(await readTable(file))
      setRows(parsed.rows)
      setFileProblem(parsed.problem ?? "")
    } catch (err) {
      setFileProblem(err instanceof Error ? err.message : "The file couldn't be read.")
    }
  }

  const send = (dryRun: boolean) => {
    if (!client) return
    setRowErrors([])
    importReturns.mutate(
      { clientId: client.ClientId, clientName: client.Client, dryRun, note: note.trim() || undefined, rows },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setChecked(true)
            toast.success(`All ${result.count} rows look good.`)
          } else {
            setDone(result)
            reset()
            setNote("")
            toast.success(`${result.count} record${result.count === 1 ? "" : "s"} returned.`)
          }
        },
        onError: (err) => {
          setChecked(false)
          if (err instanceof ApiError && err.rowErrors) setRowErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "The return failed")
        },
      },
    )
  }

  // exactly the records just returned (ids mode), in the same order as the list shown
  const doneIds = done?.items?.map((i) => i.id) ?? []
  async function downloadExcel() {
    setExcelBusy(true)
    try {
      await downloadShelvingExcel(shelvingUrlForIds(doneIds))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the Excel file.")
    } finally {
      setExcelBusy(false)
    }
  }

  const templateRows = recordReturnTemplateRows({ clientId, blankRows: Number(blankRows) })
  const canSend = !!client && rows.length > 0 && !importReturns.isPending

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Import returns"
        description="Return records that came back from a client by Excel, instead of typing or scanning each internal code. Every row is checked first — if one is wrong, nothing is returned. You then get the shelving list, in the order of where the boxes are."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/record-requests/returns" />}>
            Return by internal code
          </Button>
        }
      />

      {done && (
        <Card data-testid="import-result">
          <CardHeader>
            <CardTitle>
              {done.count} record{done.count === 1 ? "" : "s"} returned
            </CardTitle>
            <CardDescription>
              {done.closedRequests && done.closedRequests.length > 0
                ? `Request${done.closedRequests.length === 1 ? "" : "s"} ${done.closedRequests.join(", ")} complete. `
                : ""}
              Put them back in this order:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Internal code</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Box</TableHead>
                    <TableHead>Put back at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(done.items ?? []).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono">{i.internalCode}</TableCell>
                      <TableCell>{i.clientName}</TableCell>
                      <TableCell className="font-mono text-xs">{i.boxNumber}</TableCell>
                      <TableCell className="text-xs">{itemLocation(i) ? locationText(itemLocation(i)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href={`/print/record-shelving-list?ids=${doneIds.join(",")}`} target="_blank" />}>
                Print shelving list
              </Button>
              <Button variant="outline" disabled={excelBusy} onClick={() => void downloadExcel()}>
                <Download /> {excelBusy ? "Preparing…" : "Download Excel"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Client and template</CardTitle>
          <CardDescription>A file is for one client. Columns: {RECORD_RETURN_COLUMNS.map((c) => c.header).join(", ")}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ret-client">Client</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v ?? "")
                reset()
                setDone(null)
              }}
            >
              <SelectTrigger id="ret-client">
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
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="ret-rows">Empty rows to add</FieldLabel>
              <Input id="ret-rows" type="number" min={0} max={MAX_RECORD_RETURN_ROWS} value={blankRows} onChange={(e) => setBlankRows(e.target.value)} />
            </Field>
            {client ? (
              <TemplateDownload name={`${clientId || "records"}-returns-template`} rows={templateRows} />
            ) : (
              <Button variant="outline" disabled>
                Template (Excel)
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Only the <span className="font-medium">Internal code</span> is needed. <span className="font-medium">File</span> and{" "}
            <span className="font-medium">Customer</span> are optional checks: if filled in, they must match the record. A record must be on loan (and its
            request marked delivered) to be returned, and the same record can&apos;t be listed twice. The example row (internal code 1000000) must be deleted or
            replaced. At most {MAX_RECORD_RETURN_ROWS} rows per file.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="ret-upload">Excel or CSV file</FieldLabel>
            <input id="ret-upload" ref={fileInput} type="file" accept={SPREADSHEET_ACCEPT} disabled={!client} onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
            {!client && <p className="text-muted-foreground text-xs">Choose the client in step 1 first.</p>}
          </Field>
          {fileProblem && <p className="text-destructive text-sm">{fileProblem}</p>}
          {rows.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {fileName}: {rows.length} filled-in row{rows.length === 1 ? "" : "s"} read.
              {checked && " All rows checked — ready to return."}
            </p>
          )}
          {rows.length > 0 && (
            <Field className="max-w-md">
              <FieldLabel htmlFor="ret-note">Note (optional) — added to each record&apos;s history</FieldLabel>
              <Input id="ret-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </CardContent>
      </Card>

      {rowErrors.length > 0 && (
        <Card data-testid="row-errors">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} to fix — nothing was returned
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
            <Button variant="outline" size="sm" onClick={() => downloadCsv("return-errors.csv", [["Row", "Problem"], ...rowErrors.map((e) => [String(e.row), e.message])])}>
              <Download /> Download problems (CSV)
            </Button>
          </CardContent>
        </Card>
      )}

      {checked && (
        <Card data-testid="confirm-list">
          <CardHeader>
            <CardTitle className="text-base">
              3 · Confirm — {rows.length} record{rows.length === 1 ? "" : "s"} will be returned
            </CardTitle>
            <CardDescription>Every row passed the check. These records go back to storage; nothing has changed yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Row</TableHead>
                    <TableHead>Internal code</TableHead>
                    <TableHead>File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="font-mono">{r.internalCode}</TableCell>
                      <TableCell className="text-xs">{r.file || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" disabled={!canSend} onClick={() => send(true)}>
          Check file
        </Button>
        <Button disabled={!canSend || !checked} onClick={() => send(false)}>
          Return {rows.length > 0 ? `${rows.length} record${rows.length === 1 ? "" : "s"}` : ""}
        </Button>
        {(rows.length > 0 || rowErrors.length > 0 || fileProblem) && (
          <Button
            variant="ghost"
            disabled={importReturns.isPending}
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
