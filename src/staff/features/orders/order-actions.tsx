"use client"

import { todayISO } from "@/lib/formatting"
import { useState } from "react"
import { toast } from "sonner"

import { getOrderActions } from "@/domain/orders"
import {
  useApproveOrder,
  useAuthoriseDestruction,
  useAuthoriseDigitization,
  useCancelOrder,
  useCompleteOrder,
  useDestroyOrder,
  useDispatchOrder,
  useRejectOrder,
  useScheduleOrder,
  useStartOrder,
} from "@/api/orders"
import { DocumentScanner } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { DestructionMethod, Order } from "@/api/types"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

/** A dialog that collects one text field before firing a mutation (reject/cancel reasons, dispatch recipient, ...). */
function TextFieldAction({
  label,
  fieldLabel,
  buttonVariant = "outline",
  multiline,
  optional,
  onSubmit,
  isPending,
}: {
  label: string
  fieldLabel: string
  buttonVariant?: "outline" | "default" | "destructive"
  multiline?: boolean
  optional?: boolean
  onSubmit: (value: string) => Promise<unknown>
  isPending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  async function submit() {
    try {
      await onSubmit(value)
      setOpen(false)
      setValue("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={buttonVariant} size="sm" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="action-field">{fieldLabel}</FieldLabel>
          {multiline ? (
            <Textarea id="action-field" value={value} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <Input id="action-field" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={(!optional && !value) || isPending}>
            {isPending ? "Saving…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OrderActions({ order }: { order: Order }) {
  const actions = getOrderActions(order)

  const approve = useApproveOrder()
  const reject = useRejectOrder()
  const schedule = useScheduleOrder()
  const start = useStartOrder()
  const cancel = useCancelOrder()
  const dispatch = useDispatchOrder()
  const authorise = useAuthoriseDestruction()
  const authoriseDigitizing = useAuthoriseDigitization()
  const destroy = useDestroyOrder()
  const complete = useCompleteOrder()

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduledFor, setScheduledFor] = useState(todayISO)
  const [authoriseOpen, setAuthoriseOpen] = useState(false)
  const [authName, setAuthName] = useState("")
  const [authMethod, setAuthMethod] = useState<DestructionMethod>("shred")
  const [authReference, setAuthReference] = useState("")
  const [digitizeOpen, setDigitizeOpen] = useState(false)
  const [digitizeName, setDigitizeName] = useState("")
  const [digitizeNote, setDigitizeNote] = useState("")

  return (
    <div className="flex flex-wrap gap-2">
      {actions.canApprove && (
        <Button
          size="sm"
          disabled={approve.isPending}
          onClick={() => approve.mutate({ orderId: order.id }, { onError })}
        >
          Approve
        </Button>
      )}

      {actions.canReject && (
        <TextFieldAction
          label="Reject"
          fieldLabel="Reason"
          isPending={reject.isPending}
          onSubmit={(reason) => reject.mutateAsync({ orderId: order.id, input: { reason } })}
        />
      )}

      {actions.canSchedule && (
        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>Schedule</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule order</DialogTitle>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="scheduled-for">Date</FieldLabel>
              <Input
                id="scheduled-for"
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                disabled={!scheduledFor || schedule.isPending}
                onClick={() =>
                  schedule.mutate(
                    { orderId: order.id, input: { scheduledFor } },
                    { onSuccess: () => setScheduleOpen(false), onError },
                  )
                }
              >
                {schedule.isPending ? "Saving…" : "Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {actions.canStart && (
        <Button
          size="sm"
          variant="outline"
          disabled={start.isPending}
          onClick={() => start.mutate({ orderId: order.id }, { onError })}
        >
          {order.type === "collection"
            ? "Start receiving"
            : order.type === "digitize"
              ? "Start digitising"
              : "Start picking"}
        </Button>
      )}

      {actions.canAuthoriseDestruction && (
        <Dialog open={authoriseOpen} onOpenChange={setAuthoriseOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>Record authorisation</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record destruction authorisation</DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="auth-name">Authorised by</FieldLabel>
                <Input id="auth-name" value={authName} onChange={(e) => setAuthName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="auth-method">Method</FieldLabel>
                <Select value={authMethod} onValueChange={(v) => setAuthMethod((v as DestructionMethod) ?? "shred")}>
                  <SelectTrigger id="auth-method">
                    <SelectValue getLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shred">Shred</SelectItem>
                    <SelectItem value="pulp">Pulp</SelectItem>
                    <SelectItem value="incinerate">Incinerate</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="auth-ref">Reference (optional)</FieldLabel>
                <Input id="auth-ref" value={authReference} onChange={(e) => setAuthReference(e.target.value)} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={!authName || authorise.isPending}
                onClick={() =>
                  authorise.mutate(
                    {
                      orderId: order.id,
                      input: { name: authName, method: authMethod, reference: authReference || undefined },
                    },
                    { onSuccess: () => setAuthoriseOpen(false), onError },
                  )
                }
              >
                {authorise.isPending ? "Saving…" : "Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {actions.canAuthoriseDigitization && (
        <Dialog open={digitizeOpen} onOpenChange={setDigitizeOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>Record authorisation</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record digitising authorisation</DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="digitize-name">Authorised by</FieldLabel>
                <Input id="digitize-name" value={digitizeName} onChange={(e) => setDigitizeName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="digitize-note">Note (optional)</FieldLabel>
                <Textarea
                  id="digitize-note"
                  value={digitizeNote}
                  onChange={(e) => setDigitizeNote(e.target.value)}
                  placeholder="e.g. which pages or documents to scan"
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={!digitizeName.trim() || authoriseDigitizing.isPending}
                onClick={() =>
                  authoriseDigitizing.mutate(
                    { orderId: order.id, input: { name: digitizeName.trim(), note: digitizeNote.trim() || undefined } },
                    { onSuccess: () => setDigitizeOpen(false), onError },
                  )
                }
              >
                {authoriseDigitizing.isPending ? "Saving…" : "Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {actions.canFixBoxScan && (
        // The scan app is not connected yet: for now this only tells the user. Open the app from here later.
        <Button size="sm" className="gap-1.5" onClick={() => toast.info("The fix-box-scan app is not connected yet.")}>
          <DocumentScanner className="size-4" />
          fix-box-scan
        </Button>
      )}

      {actions.canDispatch && (
        <TextFieldAction
          label="Dispatch"
          fieldLabel="Recipient name"
          isPending={dispatch.isPending}
          onSubmit={(recipientName) => dispatch.mutateAsync({ orderId: order.id, input: { recipientName } })}
        />
      )}

      {actions.canDestroy && (
        <TextFieldAction
          label="Mark destroyed"
          fieldLabel="Witness (optional)"
          optional
          isPending={destroy.isPending}
          onSubmit={(witness) => destroy.mutateAsync({ orderId: order.id, input: { witness: witness || undefined } })}
        />
      )}

      {actions.canComplete && (
        <Button
          size="sm"
          disabled={complete.isPending}
          onClick={() => complete.mutate({ orderId: order.id }, { onError })}
        >
          Complete
        </Button>
      )}

      {actions.canCancel && (
        <TextFieldAction
          label="Cancel order"
          fieldLabel="Reason"
          buttonVariant="destructive"
          isPending={cancel.isPending}
          onSubmit={(reason) => cancel.mutateAsync({ orderId: order.id, input: { reason } })}
        />
      )}
    </div>
  )
}
