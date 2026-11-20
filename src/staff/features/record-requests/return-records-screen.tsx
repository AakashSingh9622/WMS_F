"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { RECORD_STATUS_LABELS, useArchiveRecords } from "@/api/archiveRecords"
import { ApiError } from "@/api/client"
import { itemLocation, useReturnRecords, type ReturnResult } from "@/api/recordReturns"
import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { locationText } from "@/domain/location"

const MAX_CODES = 200 // the same limit as the server

/** One typed code, looked up straight away so a wrong one is seen before anything is saved. */
function CodeRow({ code, problem, onRemove }: { code: string; problem?: string; onRemove: () => void }) {
  const { data, isLoading } = useArchiveRecords({ q: code, pageSize: 1 })
  const record = data?.items[0]
  const notOut = record && record.status !== "on_loan"
  return (
    <TableRow data-state={problem ? "selected" : undefined}>
      <TableCell className="font-mono">{code}</TableCell>
      <TableCell>
        {isLoading ? (
          <span className="text-muted-foreground text-xs">Looking up…</span>
        ) : !record ? (
          <span className="text-destructive text-xs">No record has this code</span>
        ) : (
          <span className="text-sm">
            {record.clientName} — box <span className="font-mono">{record.boxNumber}</span>
          </span>
        )}
        {notOut && <span className="text-destructive ml-2 text-xs">is {RECORD_STATUS_LABELS[record.status].toLowerCase()}, not on loan</span>}
        {problem && <p className="text-destructive text-xs">{problem}</p>}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${code}`}>
          Remove
        </Button>
      </TableCell>
    </TableRow>
  )
}

/**
 * Docbox "Devoluciones": type or scan the internal codes of records that came back (a scanner types the code and Enter),
 * return them all at once, and print the shelving list — the records in the order of where their box is.
 */
export function ReturnRecordsScreen() {
  const returnRecords = useReturnRecords()
  const input = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState("")
  const [codes, setCodes] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([])
  const [done, setDone] = useState<ReturnResult | null>(null)

  // Codes can be typed one at a time, or several pasted at once (spaces, commas or new lines between them).
  const add = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean)
    if (parts.length === 0) return
    const fresh = parts.filter((p, i) => parts.indexOf(p) === i && !codes.includes(p))
    if (fresh.length < parts.length) toast.info("A code that is already in the list was skipped.")
    setCodes((prev) => [...prev, ...fresh].slice(0, MAX_CODES))
    setErrors([])
    setDone(null)
    setTyped("")
  }

  const problemOf = (code: string) => errors.find((e) => e.row === codes.indexOf(code) + 1)?.message

  const send = () => {
    returnRecords.mutate(
      { codes, note: note.trim() || undefined },
      {
        onSuccess: (result) => {
          setDone(result)
          setCodes([])
          setNote("")
          setErrors([])
          toast.success(`${result.count} record${result.count === 1 ? "" : "s"} returned.`)
          input.current?.focus()
        },
        onError: (err) => {
          if (err instanceof ApiError && err.rowErrors) setErrors(err.rowErrors)
          toast.error(err instanceof Error ? err.message : "The return failed")
        },
      },
    )
  }

  const printHref = done ? `/print/record-shelving-list?ids=${done.items.map((i) => i.id).join(",")}` : ""

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Return records"
        description="Records that came back from a client. Type or scan each internal code, then return them all together. Every code is checked first — if one is wrong, nothing is returned."
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
              {done.count} record{done.count === 1 ? "" : "s"} returned
            </CardTitle>
            <CardDescription>
              {done.closedRequests.length > 0 ? `Request${done.closedRequests.length === 1 ? "" : "s"} ${done.closedRequests.join(", ")} complete. ` : ""}
              Put them back in this order:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  {done.items.map((i) => (
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
            <Button nativeButton={false} render={<Link href={printHref} target="_blank" />}>
              Print shelving list
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Internal codes</CardTitle>
          <CardDescription>Press Enter after each code (a scanner does this itself). You can also paste several codes at once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={input}
            autoFocus
            inputMode="numeric"
            className="max-w-xs font-mono"
            placeholder="e.g. 1000003"
            aria-label="Internal code"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add(typed)
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text")
              if (/[\s,;]/.test(text.trim())) {
                e.preventDefault()
                add(text)
              }
            }}
          />

          {codes.length > 0 && (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Code</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((c) => (
                      <CodeRow
                        key={c}
                        code={c}
                        problem={problemOf(c)}
                        onRemove={() => {
                          setCodes((prev) => prev.filter((x) => x !== c))
                          setErrors([])
                        }}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Field className="max-w-md">
                <FieldLabel htmlFor="rr-note">Note (optional) — added to each record&apos;s history</FieldLabel>
                <Input id="rr-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex items-center gap-3">
                <Button onClick={send} disabled={returnRecords.isPending}>
                  {returnRecords.isPending ? "Returning…" : `Return ${codes.length} record${codes.length === 1 ? "" : "s"}`}
                </Button>
                <Button variant="ghost" onClick={() => { setCodes([]); setErrors([]) }} disabled={returnRecords.isPending}>
                  Clear list
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
