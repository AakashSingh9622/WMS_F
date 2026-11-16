"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import {
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  const [reason, setReason] = useState("")
  const update = useUpdateBoxDetails()
  const { data: fields } = useCustomFields(box.clientId)
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
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Client's own fields</h3>
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
        </>
      )}

      {canHold && !box.onHold && <HoldDialog box={box} />}
      {canHold && box.onHold && (
        <Button
          variant="outline"
          size="sm"
          disabled={releaseHold.isPending}
          onClick={() =>
            releaseHold.mutate(box.id, {
              onSuccess: () => toast.success("Hold released"),
              onError,
            })
          }
        >
          {releaseHold.isPending ? "Saving…" : "Release hold"}
        </Button>
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
            toast.success(`New barcode ${updated.barcode}`)
          }}
        />
      )}
    </div>
  )
}
