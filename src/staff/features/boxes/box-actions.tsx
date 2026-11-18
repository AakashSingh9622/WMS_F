"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import {
  useAllocateBoxes,
  useCreateBoxesBatch,
  useMarkBoxMissing,
  useMarkLabelsPrinted,
  usePlaceBoxHold,
  useQuarantineBox,
  useRelabelBox,
  useReleaseBoxHold,
  useReleaseQuarantine,
  useUpdateBoxDetails,
} from "@/api/boxes"
import { useCustomFields } from "@/api/customFields"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { todayISO } from "@/lib/formatting"
import type { Box } from "@/api/types"
import { RetentionCategoryField } from "@/staff/features/boxes/retention-category-field"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function EditDetailsDialog({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState(box.description)
  const [department, setDepartment] = useState(box.department ?? "")
  const [reference, setReference] = useState(box.reference ?? "")
  const [destroyAfter, setDestroyAfter] = useState(box.destroyAfter ?? "")
  const [retentionCategory, setRetentionCategory] = useState(box.retentionCategory ?? "")
  const [palletNo, setPalletNo] = useState(box.palletNo ?? "")
  const [comments, setComments] = useState(box.comments ?? "")
  const [containerNo, setContainerNo] = useState(box.containerNo ?? "")
  const [containerType, setContainerType] = useState(box.containerType ?? "")
  const [entryDate, setEntryDate] = useState(box.entryDate ?? box.createdAt)
  const [reason, setReason] = useState("")
  const update = useUpdateBoxDetails()
  const { data: fields } = useCustomFields(box.clientId, { expedienteId: box.expedienteId })
  // The client's own fields, as text (what the inputs hold); only the ones that changed are sent.
  const [custom, setCustom] = useState<Record<string, string>>({})
  const customValue = (code: string) => custom[code] ?? String(box.customFields?.[code] ?? "")
  const customChanges = Object.fromEntries(
    (fields ?? [])
      .filter((f) => customValue(f.code) !== String(box.customFields?.[f.code] ?? ""))
      .map((f) => [f.code, customValue(f.code)])
  )

  async function submit() {
    try {
      await update.mutateAsync({
        boxId: box.id,
        input: {
          customFields: Object.keys(customChanges).length ? customChanges : undefined,
          palletNo: palletNo !== (box.palletNo ?? "") ? palletNo : undefined,
          comments: comments.trim() !== (box.comments ?? "") ? comments.trim() : undefined,
          containerNo: containerNo.trim() !== (box.containerNo ?? "") ? containerNo.trim() : undefined,
          containerType: containerType.trim() !== (box.containerType ?? "") ? containerType.trim() : undefined,
          entryDate: entryDate && entryDate !== (box.entryDate ?? box.createdAt) ? entryDate : undefined,
          description: description !== box.description ? description : undefined,
          department: department !== (box.department ?? "") ? department : undefined,
          reference: reference !== (box.reference ?? "") ? reference : undefined,
          destroyAfter: destroyAfter !== (box.destroyAfter ?? "") ? destroyAfter : undefined,
          retentionCategory:
            retentionCategory && retentionCategory !== (box.retentionCategory ?? "") ? retentionCategory : undefined,
          reason,
        },
      })
      toast.success("Box details updated")
      setOpen(false)
      setReason("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit details</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit box details</DialogTitle>
          <p className="text-muted-foreground text-sm">{box.boxNumber} · every change is recorded in the box history.</p>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
          <section className="space-y-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Contents</h3>
            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea id="edit-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-department">Department</FieldLabel>
                <Input id="edit-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-reference">Reference</FieldLabel>
                <Input id="edit-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-pallet">Pallet number</FieldLabel>
                <Input id="edit-pallet" value={palletNo} maxLength={40} onChange={(e) => setPalletNo(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-container-no">Container number</FieldLabel>
                <Input id="edit-container-no" value={containerNo} maxLength={40} onChange={(e) => setContainerNo(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-container-type">Container type</FieldLabel>
                <Input id="edit-container-type" value={containerType} maxLength={40} onChange={(e) => setContainerType(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-entry">Entry date</FieldLabel>
                <Input id="edit-entry" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="edit-comments">Comments</FieldLabel>
                <Textarea id="edit-comments" value={comments} maxLength={1000} onChange={(e) => setComments(e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3 border-t pt-5">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Retention</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-destroy-after">Destroy after</FieldLabel>
                <Input
                  id="edit-destroy-after"
                  type="date"
                  value={destroyAfter}
                  onChange={(e) => setDestroyAfter(e.target.value)}
                />
              </Field>
              <RetentionCategoryField value={retentionCategory} onChange={setRetentionCategory} />
            </div>
          </section>

          {fields && fields.length > 0 && (
            <section className="space-y-3 border-t pt-5">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Client&apos;s own fields</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <Field key={f.code}>
                    <FieldLabel htmlFor={`edit-cf-${f.code}`}>{f.name}</FieldLabel>
                    <Input
                      id={`edit-cf-${f.code}`}
                      type={f.fieldType === "date" ? "date" : f.fieldType === "number" ? "number" : "text"}
                      step={f.fieldType === "number" ? "any" : undefined}
                      value={customValue(f.code)}
                      onChange={(e) => setCustom({ ...custom, [f.code]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 border-t pt-5">
            <Field>
              <FieldLabel htmlFor="edit-reason">Reason for this change (required)</FieldLabel>
              <Input
                id="edit-reason"
                placeholder="e.g. Corrected after checking the paperwork"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!reason || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HoldDialog({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const placeHold = usePlaceBoxHold()

  async function submit() {
    try {
      await placeHold.mutateAsync({ boxId: box.id, reason })
      toast.success("Hold placed")
      setOpen(false)
      setReason("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Place hold</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place a hold on this box</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="hold-reason">Reason</FieldLabel>
          <Input id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={!reason || placeHold.isPending}>
            {placeHold.isPending ? "Saving…" : "Place hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A button that asks for a reason before running the action (quarantine, re-label). */
function ReasonDialog({
  label,
  title,
  description,
  confirm,
  pending,
  onSubmit,
}: {
  label: string
  title: string
  description?: string
  confirm: string
  pending: boolean
  onSubmit: (reason: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")

  async function submit() {
    try {
      await onSubmit(reason.trim())
      setOpen(false)
      setReason("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
        <Field>
          <FieldLabel htmlFor={`reason-${label}`}>Reason</FieldLabel>
          <Input id={`reason-${label}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={!reason.trim() || pending}>
            {pending ? "Saving…" : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MissingDialog({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const markMissing = useMarkBoxMissing()

  async function submit() {
    try {
      await markMissing.mutateAsync({ boxId: box.id, note: note.trim() })
      toast.success("Box marked missing")
      setOpen(false)
      setNote("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Mark missing</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this box missing</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="missing-note">Reason</FieldLabel>
          <Textarea
            id="missing-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is it missing? e.g. not on the shelf during the audit"
          />
          <p className="text-muted-foreground text-xs">
            The box leaves its slot (the space is freed) and cannot be put on an order until it is found.
          </p>
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={!note.trim() || markMissing.isPending}>
            {markMissing.isPending ? "Saving…" : "Mark missing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Docbox "Duplicar" (step 9): a copy of this box with its details, to change what differs and save. The copy is a new
 * box (new number, new barcode, new label); it can go on the same shelf as the original when there is room.
 */
function DuplicateBoxDialog({ box }: { box: Box }) {
  const router = useRouter()
  const create = useCreateBoxesBatch()
  const allocate = useAllocateBoxes()
  const markPrinted = useMarkLabelsPrinted()
  const { data: fields } = useCustomFields(box.clientId, { expedienteId: box.expedienteId })
  const [open, setOpen] = useState(false)
  const [printNow, setPrintNow] = useState(true)
  const [description, setDescription] = useState(box.description)
  const [department, setDepartment] = useState(box.department ?? "")
  const [reference, setReference] = useState(box.reference ?? "")
  const [palletNo, setPalletNo] = useState(box.palletNo ?? "")
  const [comments, setComments] = useState(box.comments ?? "")
  const [containerNo, setContainerNo] = useState(box.containerNo ?? "")
  const [containerType, setContainerType] = useState(box.containerType ?? "")
  const [entryDate, setEntryDate] = useState(todayISO)
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [sameShelf, setSameShelf] = useState(!!box.slotId)
  const customValue = (code: string) => custom[code] ?? String(box.customFields?.[code] ?? "")
  const busy = create.isPending || allocate.isPending

  async function submit() {
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }
    try {
      const customFields = Object.fromEntries(
        (fields ?? []).map((f) => [f.code, customValue(f.code)] as const).filter(([, v]) => v !== ""),
      )
      const [copy] = await create.mutateAsync({
        clientId: box.clientId,
        clientName: box.clientName,
        quantity: 1,
        description: description.trim(),
        department: department.trim() || undefined,
        reference: reference.trim() || undefined,
        filingDateFrom: box.filingDateFrom,
        filingDateTo: box.filingDateTo,
        destroyAfter: box.destroyAfter,
        retentionCategory: box.retentionCategory,
        customFields: Object.keys(customFields).length ? customFields : undefined,
        palletNo: palletNo.trim() || undefined,
        containerNo: containerNo.trim() || undefined,
        containerType: containerType.trim() || undefined,
        comments: comments.trim() || undefined,
        entryDate: entryDate || undefined,
        duplicateOf: box.boxNumber,
        expedienteId: box.expedienteId,
        size: box.size,
      })
      if (sameShelf && box.slotId) {
        try {
          await allocate.mutateAsync({
            allocations: [{ boxId: copy.id, slotId: box.slotId }],
            reason: `Duplicate of ${box.boxNumber}`,
          })
          toast.success(`Copy ${copy.boxNumber} created and put on the same shelf`)
        } catch (err) {
          toast.error(
            `Copy ${copy.boxNumber} created, but not put on the shelf: ${err instanceof Error ? err.message : "no room"}`,
          )
        }
      } else {
        toast.success(`Copy ${copy.boxNumber} created`)
      }
      if (printNow) {
        window.open(`/print/labels?boxIds=${copy.id}&autoprint=1`, "_blank")
        markPrinted.mutate([copy.id], { onError })
      }
      setOpen(false)
      router.push(`/app/boxes/${copy.id}`)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Duplicate</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Duplicate box</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {box.boxNumber} · a copy with a new box number. Change what is different, then create it.
          </p>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <Field>
            <FieldLabel htmlFor="dup-description">Description (required)</FieldLabel>
            <Textarea id="dup-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dup-department">Department (optional)</FieldLabel>
              <Input id="dup-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dup-reference">Reference (optional)</FieldLabel>
              <Input id="dup-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dup-pallet">Pallet number (optional)</FieldLabel>
              <Input id="dup-pallet" value={palletNo} maxLength={40} onChange={(e) => setPalletNo(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dup-container-no">Container number (optional)</FieldLabel>
              <Input id="dup-container-no" value={containerNo} maxLength={40} onChange={(e) => setContainerNo(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dup-container-type">Container type (optional)</FieldLabel>
              <Input id="dup-container-type" value={containerType} maxLength={40} onChange={(e) => setContainerType(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dup-entry">Entry date</FieldLabel>
              <Input id="dup-entry" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="dup-comments">Comments (optional)</FieldLabel>
              <Textarea id="dup-comments" value={comments} maxLength={1000} onChange={(e) => setComments(e.target.value)} />
            </Field>
            {(fields ?? []).map((f) => (
              <Field key={f.code}>
                <FieldLabel htmlFor={`dup-cf-${f.code}`}>{f.name}</FieldLabel>
                <Input
                  id={`dup-cf-${f.code}`}
                  type={f.fieldType === "date" ? "date" : f.fieldType === "number" ? "number" : "text"}
                  step={f.fieldType === "number" ? "any" : undefined}
                  value={customValue(f.code)}
                  onChange={(e) => setCustom({ ...custom, [f.code]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {box.slotId && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" checked={sameShelf} onCheckedChange={(v) => setSameShelf(!!v)} />
              <span>
                <span className="font-medium">Put the copy on the same shelf</span>
                <span className="text-muted-foreground block text-xs">
                  Needs room for another {box.lengthCm ?? "?"} cm there; if there is none, the copy is created without a shelf.
                </span>
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox className="mt-0.5" checked={printNow} onCheckedChange={(v) => setPrintNow(!!v)} />
            <span>
              <span className="font-medium">Print the new label now</span>
              <span className="text-muted-foreground block text-xs">Opens the label for printing and marks it printed.</span>
            </span>
          </label>
          <p className="text-muted-foreground text-xs">
            Filing dates, destroy-after date, retention category and size are copied from the original.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!description.trim() || busy}>
            {busy ? "Creating…" : "Create the copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BoxActions({ box }: { box: Box }) {
  const canOperate = useCan("boxes.operate")
  const canHold = useCan("boxes.hold")
  const releaseHold = useReleaseBoxHold()
  const markPrinted = useMarkLabelsPrinted()
  const quarantine = useQuarantineBox()
  const releaseQuarantine = useReleaseQuarantine()
  const relabel = useRelabelBox()
  // Quarantine is only for a box that is with us and not on an order (the API says why otherwise).
  const canQuarantineNow = ["stored", "digitized", "unallocated", "received"].includes(box.status) && !box.openOrder

  if (box.status === "destroyed" || (!canOperate && !canHold)) return null

  return (
    <div className="flex flex-wrap gap-2">
      {canOperate && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={markPrinted.isPending}
            onClick={() => {
              window.open(`/print/labels?boxIds=${box.id}&autoprint=1`, "_blank")
              markPrinted.mutate([box.id], { onError })
            }}
          >
            Reprint label
          </Button>

          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/app/boxes/${box.id}/move`} />}>
            {box.status === "missing" ? "Found — place in a slot" : "Move"}
          </Button>

          <EditDetailsDialog box={box} />
          <DuplicateBoxDialog box={box} />
        </>
      )}

      {canHold && !box.onHold && <HoldDialog box={box} />}
      {canHold && box.onHold && (
        <ReasonDialog
          label="Release hold"
          title="Release this hold?"
          description={`${box.boxNumber} is on hold${box.holdReason ? ` (“${box.holdReason}”)` : ""}. Once released it can go on orders again. Say why it is being released — this goes into the box history.`}
          confirm="Release the hold"
          pending={releaseHold.isPending}
          onSubmit={async (reason) => {
            await releaseHold.mutateAsync({ boxId: box.id, reason })
            toast.success("Hold released")
          }}
        />
      )}

      {canOperate && box.status !== "missing" && <MissingDialog box={box} />}

      {canHold && canQuarantineNow && (
        <ReasonDialog
          label="Quarantine"
          title="Quarantine this box"
          description="It stays where it is but can't go on any order until it's released (e.g. water damage, under investigation)."
          confirm="Quarantine"
          pending={quarantine.isPending}
          onSubmit={async (reason) => {
            await quarantine.mutateAsync({ boxId: box.id, reason })
            toast.success("Box quarantined")
          }}
        />
      )}
      {canHold && box.status === "quarantined" && (
        <Button
          variant="outline"
          size="sm"
          disabled={releaseQuarantine.isPending}
          onClick={() =>
            releaseQuarantine.mutate(box.id, { onSuccess: () => toast.success("Released from quarantine"), onError })
          }
        >
          {releaseQuarantine.isPending ? "Saving…" : "Release quarantine"}
        </Button>
      )}

      {canOperate && (
        <ReasonDialog
          label="Re-label"
          title="Give this box a new label"
          description="Same box, new barcode — the old label stops scanning. The new label opens for printing."
          confirm="Make new label"
          pending={relabel.isPending}
          onSubmit={async (reason) => {
            const updated = await relabel.mutateAsync({ boxId: box.id, reason })
            window.open(`/print/labels?boxIds=${updated.id}&autoprint=1`, "_blank")
            // The new label is being printed now: the re-label cleared the flag, so set it again.
            markPrinted.mutate([updated.id], { onError })
            toast.success(`New barcode ${updated.barcode}`)
          }}
        />
      )}
    </div>
  )
}
