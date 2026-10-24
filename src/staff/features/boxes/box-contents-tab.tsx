"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useAddBoxContent, useBox, useBoxContents, useRemoveBoxContent } from "@/api/boxes"
import { useCan } from "@/auth/useAuth"
import { formatDate, formatDateRange } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
                    <TableCell>
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
