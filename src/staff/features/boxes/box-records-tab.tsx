"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  RECORD_STATUS_LABELS,
  useArchiveRecordEvents,
  useArchiveRecords,
  useCreateArchiveRecord,
  useDuplicateArchiveRecord,
  useUpdateArchiveRecord,
  type ArchiveRecord,
  type RecordStatus,
} from "@/api/archiveRecords"
import { useBox } from "@/api/boxes"
import { useCustomFields, type CustomField } from "@/api/customFields"
import { useCan } from "@/auth/useAuth"
import { PaginationFooter } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDateTime } from "@/lib/formatting"

const PAGE_SIZE = 50

const STATUS_VARIANT: Record<RecordStatus, "secondary" | "default" | "outline" | "destructive"> = {
  archived: "secondary",
  on_loan: "default",
  in_transit: "outline",
  destroyed: "destructive",
}

type Dialog_ = { kind: "create" } | { kind: "edit"; record: ArchiveRecord } | { kind: "duplicate"; record: ArchiveRecord } | { kind: "history"; record: ArchiveRecord }

function showValue(def: CustomField, value: string | number | undefined) {
  if (value === undefined || value === "") return "—"
  return def.fieldType === "date" ? formatDate(String(value)) : String(value)
}

/** The create / edit / duplicate form: the client's own fields (mandatory ones marked) and comments. */
function RecordForm({
  mode,
  boxId,
  boxNumber,
  fields,
  onDone,
}: {
  mode: { kind: "create" } | { kind: "edit"; record: ArchiveRecord } | { kind: "duplicate"; record: ArchiveRecord }
  boxId: string
  boxNumber: string
  fields: CustomField[]
  onDone: () => void
}) {
  const create = useCreateArchiveRecord()
  const update = useUpdateArchiveRecord()
  const duplicate = useDuplicateArchiveRecord()
  const source = mode.kind === "create" ? undefined : mode.record
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.code, source?.fields?.[f.code] !== undefined ? String(source.fields[f.code]) : ""])),
  )
  const [comments, setComments] = useState(source?.comments ?? "")
  const busy = create.isPending || update.isPending || duplicate.isPending
  const missing = fields.filter((f) => f.required && !(values[f.code] ?? "").trim())

  async function save() {
    try {
      if (mode.kind === "create") {
        const sent = Object.fromEntries(fields.map((f) => [f.code, (values[f.code] ?? "").trim()]).filter(([, v]) => v))
        const made = await create.mutateAsync({ boxId, fields: sent, comments: comments.trim() || undefined })
        toast.success(`Record ${made.internalCode} created in ${boxNumber}`)
      } else if (mode.kind === "edit") {
        // Only what changed is sent; "" clears an optional field.
        const changed: Record<string, string> = {}
        for (const f of fields) {
          const next = (values[f.code] ?? "").trim()
          const before = mode.record.fields?.[f.code] !== undefined ? String(mode.record.fields[f.code]) : ""
          if (next !== before) changed[f.code] = next
        }
        const commentsChanged = comments.trim() !== (mode.record.comments ?? "")
        if (Object.keys(changed).length === 0 && !commentsChanged) {
          toast.info("Nothing was changed")
          onDone()
          return
        }
        await update.mutateAsync({
          id: mode.record.id,
          fields: Object.keys(changed).length ? changed : undefined,
          comments: commentsChanged ? comments.trim() : undefined,
        })
        toast.success(`Record ${mode.record.internalCode} saved`)
      } else {
        const sent = Object.fromEntries(fields.map((f) => [f.code, (values[f.code] ?? "").trim()]))
        const copy = await duplicate.mutateAsync({ id: mode.record.id, fields: sent, comments: comments.trim() })
        toast.success(`Record ${copy.internalCode} created as a copy of ${mode.record.internalCode}`)
      }
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the record")
    }
  }

  return (
    <>
      <FieldGroup>
        {fields.length === 0 && (
          <p className="text-muted-foreground text-sm">
            This client has no fields of its own yet (Settings → Custom fields), so a record holds only comments.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.code}>
              <FieldLabel htmlFor={`rec-${f.code}`}>
                {f.name}
                {f.required ? " *" : " (optional)"}
              </FieldLabel>
              <Input
                id={`rec-${f.code}`}
                type={f.fieldType === "date" ? "date" : f.fieldType === "number" ? "number" : "text"}
                step={f.fieldType === "number" ? "any" : undefined}
                value={values[f.code] ?? ""}
                onChange={(e) => setValues({ ...values, [f.code]: e.target.value })}
                disabled={busy}
              />
            </Field>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor="rec-comments">Comments (optional)</FieldLabel>
          <Input id="rec-comments" value={comments} maxLength={500} onChange={(e) => setComments(e.target.value)} disabled={busy} />
        </Field>
      </FieldGroup>
      <DialogFooter className="items-center">
        {missing.length > 0 && <span className="text-muted-foreground mr-auto text-xs">Still needed: {missing.map((f) => f.name).join(", ")}</span>}
        <Button variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || missing.length > 0}>
          {busy ? "Saving…" : mode.kind === "duplicate" ? "Create copy" : mode.kind === "edit" ? "Save" : "Add record"}
        </Button>
      </DialogFooter>
    </>
  )
}

function RecordHistory({ record }: { record: ArchiveRecord }) {
  const { data: events, isLoading } = useArchiveRecordEvents(record.id)
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (!events?.length) return <p className="text-muted-foreground text-sm">No history yet.</p>
  return (
    <ul className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
      {events.map((e) => (
        <li key={e.id} className="border-l-2 pl-3">
          <p className="font-medium capitalize">{e.type.replace("_", " ")}</p>
          {e.note && <p className="text-muted-foreground break-words">{e.note}</p>}
          <p className="text-muted-foreground text-xs">
            {e.actor.name ?? "—"}, {formatDateTime(e.at)}
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Records" tab of a box (Docbox "Recepción de Expedientes"): the records inside this box, each with its internal code
 * and the client's own fields. Add one by hand, edit it, copy it, see its history. Separate from the Contents tab.
 */
export function BoxRecordsTab({ boxId }: { boxId: string }) {
  const canOperate = useCan("boxes.operate")
  const { data: box, isLoading: boxLoading } = useBox(boxId)
  const { data: fieldDefs } = useCustomFields(box?.clientId ?? "", { expedienteId: box?.expedienteId })
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useArchiveRecords({ boxId, page, pageSize: PAGE_SIZE })
  const [dialog, setDialog] = useState<Dialog_ | null>(null)

  if (boxLoading || isLoading) return <Skeleton className="h-48 w-full" />
  if (!box) return null
  const fields = fieldDefs ?? []
  const editable = canOperate && box.status !== "destroyed" && box.status !== "permanently_withdrawn"
  const items = data?.items ?? []
  const title =
    dialog?.kind === "create"
      ? `Add a record to ${box.boxNumber}`
      : dialog?.kind === "edit"
        ? `Edit record ${dialog.record.internalCode}`
        : dialog?.kind === "duplicate"
          ? `Copy of record ${dialog.record.internalCode}`
          : dialog?.kind === "history"
            ? `History of record ${dialog.record.internalCode}`
            : ""

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Records are the individual files inside this box. Each has its own internal code and the client&apos;s own fields. They are
          separate from the Contents tab.
        </p>
        {editable && <Button onClick={() => setDialog({ kind: "create" })}>Add record</Button>}
      </div>

      {isError ? (
        <p className="text-destructive text-sm">Couldn&apos;t load the records{error instanceof Error ? `: ${error.message}` : "."}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No records in this box yet.</p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Internal code</TableHead>
                {fields.map((f) => (
                  <TableHead key={f.code}>{f.name}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono tabular-nums">{r.internalCode}</TableCell>
                  {fields.map((f) => (
                    <TableCell key={f.code}>{showValue(f, r.fields?.[f.code])}</TableCell>
                  ))}
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{RECORD_STATUS_LABELS[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{r.comments ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {r.createdBy.name ?? "—"}, {formatDate(r.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {editable && r.status !== "destroyed" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "duplicate", record: r })}>
                          Duplicate
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "edit", record: r })}>
                          Edit
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "history", record: r })}>
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {(data?.total ?? 0) > PAGE_SIZE && <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {dialog?.kind === "history" ? (
            <RecordHistory record={dialog.record} />
          ) : dialog ? (
            <RecordForm
              // a fresh form (and fresh values) for every record / mode
              key={dialog.kind === "create" ? "create" : `${dialog.kind}-${dialog.record.id}`}
              mode={dialog}
              boxId={box.id}
              boxNumber={box.boxNumber}
              fields={fields}
              onDone={() => setDialog(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
