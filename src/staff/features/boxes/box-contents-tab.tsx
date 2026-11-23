"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  useAddBoxContent,
  useBox,
  useBoxContents,
  useMoveBoxContent,
  useRemoveBoxContent,
  useUpdateBoxContent,
  type BoxContent,
} from "@/api/boxes"
import { useCan } from "@/auth/useAuth"
import { formatDate, formatDateRange } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** Docbox "Modificar" on a record. */
function EditContentDialog({ boxId, content }: { boxId: string; content: BoxContent }) {
  const update = useUpdateBoxContent()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState(content.description)
  const [reference, setReference] = useState(content.reference ?? "")
  const [dateFrom, setDateFrom] = useState(content.dateFrom ?? "")
  const [dateTo, setDateTo] = useState(content.dateTo ?? "")
  const [docId, setDocId] = useState(content.docusoftDocumentId ?? "")

  async function save() {
    try {
      await update.mutateAsync({
        boxId,
        contentId: content.id,
        input: {
          description: description.trim(),
          reference: reference.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          docusoftDocumentId: docId.trim() || undefined,
        },
      })
      toast.success("Saved")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save it")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit this file</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ec-desc">Description</FieldLabel>
            <Input id="ec-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ec-ref">Reference (optional)</FieldLabel>
            <Input id="ec-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ec-from">Date from (optional)</FieldLabel>
              <Input id="ec-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ec-to">Date to (optional)</FieldLabel>
              <Input id="ec-to" type="date" min={dateFrom || undefined} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ec-doc">DocuSoft document id (optional)</FieldLabel>
            <Input id="ec-doc" value={docId} onChange={(e) => setDocId(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!description.trim() || update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Docbox "Cambio de Ubicación" for a record: put it into another box of the same client. */
function MoveContentDialog({ boxId, content }: { boxId: string; content: BoxContent }) {
  const move = useMoveBoxContent()
  const [open, setOpen] = useState(false)
  const [toBox, setToBox] = useState("")
  const [reason, setReason] = useState("")

  async function submit() {
    try {
      await move.mutateAsync({ boxId, contentId: content.id, toBox: toBox.trim(), reason: reason.trim() || undefined })
      toast.success(`Moved to ${toBox.trim().toUpperCase()}`)
      setOpen(false)
      setToBox("")
      setReason("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move it")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Move</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this file to another box</DialogTitle>
          <p className="text-muted-foreground text-sm">“{content.description}” will leave this box and go into the one you name. Both boxes record it in their history.</p>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="mc-box">Box number or barcode</FieldLabel>
            <Input id="mc-box" placeholder="e.g. BX00000131" value={toBox} onChange={(e) => setToBox(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mc-reason">Reason (optional)</FieldLabel>
            <Input id="mc-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!toBox.trim() || move.isPending}>
            {move.isPending ? "Moving…" : "Move it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** File-level index of what is in the box (spec §3 "Contents and DMS links"). Clients see it in the portal too. */
export function BoxContentsTab({ boxId }: { boxId: string }) {
  const canOperate = useCan("boxes.operate")
  const { data: box } = useBox(boxId)
  const { data: contents, isLoading } = useBoxContents(boxId)
  const add = useAddBoxContent()
  const remove = useRemoveBoxContent()
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [docId, setDocId] = useState("")
  const editable = canOperate && box?.status !== "destroyed"

  async function submit() {
    try {
      await add.mutateAsync({
        boxId,
        input: {
          description: description.trim(),
          reference: reference.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          docusoftDocumentId: docId.trim() || undefined,
        },
      })
      setDescription("")
      setReference("")
      setDateFrom("")
      setDateTo("")
      setDocId("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add it")
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !contents?.length ? (
        <p className="text-muted-foreground text-sm">Nothing listed yet. The box description is on the Overview tab.</p>
      ) : (
        <div className="bg-card rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File / item</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>DocuSoft document</TableHead>
                <TableHead>Added</TableHead>
                {editable && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.description}</TableCell>
                  <TableCell>{c.reference ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.dateFrom || c.dateTo ? formatDateRange(c.dateFrom, c.dateTo) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.docusoftDocumentId ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.createdBy.name}, {formatDate(c.createdAt)}
                  </TableCell>
                  {editable && (
                    <TableCell className="whitespace-nowrap">
                      {/* Docbox "Duplicar": copy the line into the form below, change what differs, then Add */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDescription(c.description)
                          setReference(c.reference ?? "")
                          setDateFrom(c.dateFrom ?? "")
                          setDateTo(c.dateTo ?? "")
                          setDocId("")
                          document.getElementById("bc-desc")?.focus()
                          toast.info("Copied into the form below — change what differs, then press Add.")
                        }}
                      >
                        Duplicate
                      </Button>
                      <EditContentDialog boxId={boxId} content={c} />
                      <MoveContentDialog boxId={boxId} content={c} />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(
                            { boxId, contentId: c.id },
                            {
                              onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove it"),
                            },
                          )
                        }
                      >
                        Remove
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editable && (
        <div className="bg-card max-w-3xl rounded-2xl border p-4">
          <h2 className="mb-3 text-sm font-semibold">Add a file</h2>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="bc-desc">Description</FieldLabel>
                <Input id="bc-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bc-ref">Reference (optional)</FieldLabel>
                <Input id="bc-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bc-from">Date from (optional)</FieldLabel>
                <Input id="bc-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bc-to">Date to (optional)</FieldLabel>
                <Input id="bc-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bc-doc">DocuSoft document id (optional)</FieldLabel>
                <Input id="bc-doc" value={docId} onChange={(e) => setDocId(e.target.value)} />
              </Field>
            </div>
            <Button className="w-fit" onClick={submit} disabled={!description.trim() || add.isPending}>
              {add.isPending ? "Adding…" : "Add"}
            </Button>
          </FieldGroup>
        </div>
      )}
    </div>
  )
}
