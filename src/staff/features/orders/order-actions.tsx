"use client"

import Link from "next/link"
import { todayISO } from "@/lib/formatting"
import { useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/auth/useAuth"
import { getOrderActions } from "@/domain/orders"
import { LOAN_TYPES, loanTypeLabel, loanTypeOf, type LoanType } from "@/domain/loan-type"
import { REQUEST_CHANNELS, requestChannelLabel, type RequestChannel } from "@/domain/request-channel"
import {
  useApproveDestruction,
  useApproveOrder,
  useAuthoriseDestruction,
  useAuthoriseDigitization,
  useCancelOrder,
  useCompleteOrder,
  useDigitizeOrder,
  useDispatchOrder,
  useEditOrderDetails,
  type EditOrderDetailsInput,
  useHoldOrder,
  useOrderLines,
  useRecordDelivery,
  useReopenOrder,
  useResumeOrder,
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
import { DestroyDialog } from "@/staff/features/orders/destroy-dialog"

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
      await onSubmit(value.trim())
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
            <Input
              id="action-field"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (optional || value.trim()) && !isPending) void submit()
              }}
            />
          )}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button
            variant={buttonVariant === "destructive" ? "destructive" : "default"}
            onClick={submit}
            disabled={(!optional && !value.trim()) || isPending}
          >
            {isPending ? "Saving…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A dialog with a few text fields (first one required unless marked optional) before firing a mutation. */
function FieldsAction({
  label,
  title,
  fields,
  buttonVariant = "outline",
  onSubmit,
  isPending,
}: {
  label: string
  title?: string
  fields: { name: string; label: string; optional?: boolean }[]
  buttonVariant?: "outline" | "default"
  onSubmit: (values: Record<string, string | undefined>) => Promise<unknown>
  isPending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const ready = fields.every((f) => f.optional || (values[f.name] ?? "").trim())

  async function submit() {
    try {
      const clean: Record<string, string | undefined> = {}
      for (const f of fields) clean[f.name] = (values[f.name] ?? "").trim() || undefined
      await onSubmit(clean)
      setOpen(false)
      setValues({})
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={buttonVariant} />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? label}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          {fields.map((f) => (
            <Field key={f.name}>
              <FieldLabel htmlFor={`fa-${f.name}`}>
                {f.label}
                {f.optional ? " (optional)" : ""}
              </FieldLabel>
              <Input
                id={`fa-${f.name}`}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            </Field>
          ))}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!ready || isPending}>
            {isPending ? "Saving…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Digitise order: staff scan each box's documents (with the scanner of their choice), tick the box here once it is
 * done, and when every box is ticked the order is completed and the boxes are marked as digitised.
 */
function DigitiseDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())
  const { data: lines = [], isLoading } = useOrderLines(order.id)
  const start = useStartOrder()
  const digitize = useDigitizeOrder()
  const open_ = lines.filter((l) => l.status !== "removed" && l.status !== "missing")
  const allDone = open_.length > 0 && open_.every((l) => done.has(l.id))
  const busy = start.isPending || digitize.isPending

  async function finish() {
    try {
      if (order.status === "scheduled") await start.mutateAsync({ orderId: order.id })
      await digitize.mutateAsync({ orderId: order.id })
      toast.success(`${open_.length} box${open_.length === 1 ? "" : "es"} digitised`)
      setOpen(false)
    } catch (err) {
      onError(err)
    }
  }

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <DocumentScanner className="size-4" />
        Digitise boxes
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Digitise {order.orderNumber}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Scan each box&apos;s documents, then tick the box. When all are ticked, finish to complete the order.
            {order.digitization?.note ? ` Client note: ${order.digitization.note}` : ""}
          </p>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
          {isLoading && <li className="text-muted-foreground p-3">Loading boxes…</li>}
          {open_.map((line) => (
            <li key={line.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" checked={done.has(line.id)} onChange={() => toggle(line.id)} />
                <span className={done.has(line.id) ? "text-muted-foreground line-through" : "font-medium"}>
                  {line.boxNumber}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          {open_.filter((l) => done.has(l.id)).length} of {open_.length} scanned
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button disabled={!allDone || busy} onClick={finish}>
            {busy ? "Saving…" : "Finish digitising"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OrderActions({ order }: { order: Order }) {
  const { user } = useAuth()
  const actions = getOrderActions(order, user?.roles ?? [])

  const approve = useApproveOrder()
  const reject = useRejectOrder()
  const schedule = useScheduleOrder()
  const start = useStartOrder()
  const cancel = useCancelOrder()
  const dispatch = useDispatchOrder()
  const authorise = useAuthoriseDestruction()
  const authoriseDigitizing = useAuthoriseDigitization()
  const complete = useCompleteOrder()
  const hold = useHoldOrder()
  const approveDestruction = useApproveDestruction()
  const recordDelivery = useRecordDelivery()
  const resume = useResumeOrder()
  const reopen = useReopenOrder()

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

      {actions.waitingForPayment && (
        <Button size="sm" variant="outline" disabled title="Unlocks once the invoice is paid or billing is waived">
          Schedule (waiting for payment)
        </Button>
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

      {actions.canFixBoxScan && <DigitiseDialog order={order} />}

      {actions.canDispatch && (
        <FieldsAction
          label="Dispatch"
          title="Dispatch order"
          fields={[
            { name: "recipientName", label: "Recipient name" },
            { name: "courier", label: "Courier", optional: true },
            { name: "trackingRef", label: "Tracking reference", optional: true },
          ]}
          isPending={dispatch.isPending}
          onSubmit={(v) =>
            dispatch.mutateAsync({
              orderId: order.id,
              input: { recipientName: v.recipientName as string, courier: v.courier, trackingRef: v.trackingRef },
            })
          }
        />
      )}

      {actions.canApproveDestruction && (
        <Button
          size="sm"
          disabled={approveDestruction.isPending}
          onClick={() =>
            approveDestruction.mutate(
              { orderId: order.id },
              { onSuccess: () => toast.success("Destruction approved"), onError },
            )
          }
        >
          {approveDestruction.isPending ? "Approving…" : "Approve destruction (2nd signature)"}
        </Button>
      )}

      {/* with the signer's signature, which goes on the certificate */}
      {actions.canDestroy && <DestroyDialog orderId={order.id} />}

      {actions.canRecordDelivery && (
        <FieldsAction
          label="Record delivery"
          title="Proof of delivery"
          fields={[
            { name: "receivedBy", label: "Received by" },
            { name: "proofReference", label: "Proof reference (signature / POD number)", optional: true },
          ]}
          isPending={recordDelivery.isPending}
          onSubmit={(v) =>
            recordDelivery.mutateAsync({
              orderId: order.id,
              input: { receivedBy: v.receivedBy as string, proofReference: v.proofReference },
            })
          }
        />
      )}

      {actions.canPick && (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/orders/${order.id}/pick`} />}
        >
          Pick (scan)
        </Button>
      )}

      {actions.canReceive && (
        <Button size="sm" nativeButton={false} render={<Link href={`/app/orders/${order.id}/receive`} />}>
          Receive (scan)
        </Button>
      )}

      {actions.canComplete && (
        <Button
          size="sm"
          variant="outline"
          disabled={complete.isPending}
          onClick={() => complete.mutate({ orderId: order.id }, { onError })}
        >
          Complete
        </Button>
      )}

      {actions.canHold && (
        <TextFieldAction
          label="Put on hold"
          fieldLabel="Reason"
          isPending={hold.isPending}
          onSubmit={(reason) => hold.mutateAsync({ orderId: order.id, input: { reason } })}
        />
      )}

      {actions.canResume && (
        <Button size="sm" disabled={resume.isPending} onClick={() => resume.mutate({ orderId: order.id }, { onError })}>
          Resume
        </Button>
      )}

      {actions.canEditDetails && <EditRequestDialog order={order} />}

      {actions.canReopen && (
        <TextFieldAction
          label="Reopen order"
          fieldLabel="Why is it being reopened?"
          isPending={reopen.isPending}
          onSubmit={(reason) => reopen.mutateAsync({ orderId: order.id, input: { reason } })}
        />
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

/** Docbox "Modificar Peticiones": fix the loan type, how the client asked, or who asked, after the request was logged. */
function EditRequestDialog({ order }: { order: Order }) {
  const edit = useEditOrderDetails()
  const isLoan = order.type === "dispatch" || order.type === "digitize"
  const [open, setOpen] = useState(false)
  const [loanType, setLoanType] = useState<LoanType>(loanTypeOf(order) ?? "normal")
  const [channel, setChannel] = useState<string>(order.requestChannel ?? "none")
  const [email, setEmail] = useState(order.contactEmail ?? "")
  const [remarks, setRemarks] = useState("")

  const submit = () => {
    const input: EditOrderDetailsInput = {}
    if (isLoan && loanType !== loanTypeOf(order)) input.loanType = loanType
    if (channel !== (order.requestChannel ?? "none")) input.requestChannel = channel === "none" ? "" : (channel as RequestChannel)
    if (email.trim() && email.trim().toLowerCase() !== (order.contactEmail ?? "")) input.contactEmail = email.trim()
    if (remarks.trim()) input.remarks = remarks.trim()
    if (Object.keys(input).length === 0) {
      toast.info("Nothing was changed.")
      return
    }
    edit.mutate(
      { orderId: order.id, input },
      {
        onSuccess: () => {
          toast.success("Request updated.")
          setOpen(false)
          setRemarks("")
        },
        onError,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit request</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit request {order.orderNumber}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          {isLoan && (
            <Field>
              <FieldLabel htmlFor="edit-loan-type">Loan type</FieldLabel>
              <Select value={loanType} onValueChange={(v) => setLoanType((v as LoanType) ?? "normal")}>
                <SelectTrigger id="edit-loan-type">
                  <SelectValue getLabel={(v) => loanTypeLabel(v) ?? v} />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="edit-channel">How the client asked</FieldLabel>
            <Select value={channel} onValueChange={(v) => setChannel(v ?? "none")}>
              <SelectTrigger id="edit-channel">
                <SelectValue getLabel={(v) => (v === "none" ? "Not recorded" : (requestChannelLabel(v) ?? v))} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not recorded</SelectItem>
                {REQUEST_CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-email">Requested by (contact email)</FieldLabel>
            <Input id="edit-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-remarks">Remark (optional, added to the order notes)</FieldLabel>
            <Textarea id="edit-remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={edit.isPending} onClick={submit}>
            {edit.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
