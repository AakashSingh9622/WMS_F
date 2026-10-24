"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import {
  useMarkBoxMissing,
  useMarkLabelsPrinted,
  usePlaceBoxHold,
  useReleaseBoxHold,
  useUpdateBoxDetails,
} from "@/api/boxes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Box } from "@/api/types"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function EditDetailsDialog({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState(box.description)
  const [department, setDepartment] = useState(box.department ?? "")
  const [reference, setReference] = useState(box.reference ?? "")
  const [destroyAfter, setDestroyAfter] = useState(box.destroyAfter ?? "")
  const [reason, setReason] = useState("")
  const update = useUpdateBoxDetails()

  async function submit() {
    try {
      await update.mutateAsync({
        boxId: box.id,
        input: {
          description: description !== box.description ? description : undefined,
          department: department !== (box.department ?? "") ? department : undefined,
          reference: reference !== (box.reference ?? "") ? reference : undefined,
          destroyAfter: destroyAfter !== (box.destroyAfter ?? "") ? destroyAfter : undefined,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit box details</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-description">Description</FieldLabel>
            <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-department">Department</FieldLabel>
            <Input id="edit-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-reference">Reference</FieldLabel>
            <Input id="edit-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-destroy-after">Destroy after</FieldLabel>
            <Input
              id="edit-destroy-after"
              type="date"
              value={destroyAfter}
              onChange={(e) => setDestroyAfter(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-reason">Reason for this change</FieldLabel>
            <Input id="edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
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
              window.open(`/print/labels?boxIds=${box.id}`, "_blank")
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
    </div>
  )
}
