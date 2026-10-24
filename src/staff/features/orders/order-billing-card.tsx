"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useClientAccount } from "@/api/billing"
import {
  useAcknowledgeOrderInvoice,
  useRecordOrderPayment,
  useSetPaymentRequired,
  useWaiveOrderBilling,
} from "@/api/orders"
import { useStripeTransaction } from "@/api/stripe"
import { useAuth } from "@/auth/useAuth"
import { getOrderActions } from "@/domain/orders"
import { formatDateTime, formatMoney } from "@/lib/formatting"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Order, OrderBillingStatus } from "@/api/types"

const STATUS_TEXT: Record<OrderBillingStatus, string> = {
  awaiting_invoice: "Waiting for the invoice",
  invoice_draft: "Invoice drafted — not in Sage yet",
  awaiting_payment: "Waiting for payment",
  awaiting_acknowledgement: "Waiting for the client to acknowledge",
  paid: "Paid",
  acknowledged: "Acknowledged — on account",
  waived: "Billing waived",
}
const SETTLED: OrderBillingStatus[] = ["paid", "acknowledged", "waived"]
const METHOD_TEXT = { card: "Card", bank_transfer: "Bank transfer", other: "Other" } as const
type Method = keyof typeof METHOD_TEXT

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function RecordPaymentDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<Method>("bank_transfer")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const record = useRecordOrderPayment()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Record payment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment for {order.orderNumber}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pay-method">How it was paid</FieldLabel>
            <Select value={method} onValueChange={(v) => setMethod((v as Method) ?? method)}>
              <SelectTrigger id="pay-method">
                <SelectValue getLabel={(v) => METHOD_TEXT[v as Method]} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_TEXT) as Method[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_TEXT[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Amount: {formatMoney(order.billing?.amount ?? 0)}. Record it in Sage too — the WMS doesn&apos;t mark the
              Sage invoice as paid.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-ref">Reference (optional)</FieldLabel>
            <Input
              id="pay-ref"
              placeholder="e.g. BACS reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-note">Note (optional)</FieldLabel>
            <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={record.isPending}
            onClick={() =>
              record.mutate(
                {
                  orderId: order.id,
                  input: { method, reference: reference.trim() || undefined, note: note.trim() || undefined },
                },
                {
                  onSuccess: () => (toast.success("Payment recorded — the order can be scheduled"), setOpen(false)),
                  onError,
                },
              )
            }
          >
            {record.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WaiveDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const waive = useWaiveOrderBilling()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Waive billing</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive billing for {order.orderNumber}?</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="waive-reason">Why no payment is needed</FieldLabel>
          <Textarea
            id="waive-reason"
            placeholder="e.g. No charge"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <FieldDescription>
            No invoice for this order; it can be scheduled. A waived order is still charged by the monthly billing run.
            (Billed on account instead? Tick &quot;Payment not required&quot; and raise the invoice.)
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button
            disabled={!reason.trim() || waive.isPending}
            onClick={() =>
              waive.mutate(
                { orderId: order.id, input: { reason: reason.trim() } },
                { onSuccess: () => (toast.success("Billing waived"), setOpen(false)), onError },
              )
            }
          >
            {waive.isPending ? "Saving…" : "Waive billing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Record that the client acknowledged the invoice (payment not required) — e.g. they confirmed by email or phone. */
function AcknowledgeDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const acknowledge = useAcknowledgeOrderInvoice()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Record acknowledgement</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>The client acknowledged invoice {order.billing?.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="ack-note">How (optional)</FieldLabel>
          <Input
            id="ack-note"
            placeholder="e.g. confirmed by email"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <FieldDescription>
            The client normally does this in the portal. The invoice stays owed on their account; the order can be
            scheduled.
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(
                { orderId: order.id, input: { note: note.trim() || undefined } },
                {
                  onSuccess: () => (toast.success("Acknowledged — the order can be scheduled"), setOpen(false)),
                  onError,
                },
              )
            }
          >
            {acknowledge.isPending ? "Saving…" : "Record acknowledgement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The "payment not required" tick: clients billed monthly / annually only acknowledge the invoice. */
function PaymentNotRequired({ order, editable }: { order: Order; editable: boolean }) {
  const setRequired = useSetPaymentRequired()
  const checked = !!order.billing?.paymentNotRequired
  return (
    <label className={editable ? "flex cursor-pointer items-start gap-3" : "flex items-start gap-3"}>
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={!editable || setRequired.isPending}
        onCheckedChange={(v) =>
          setRequired.mutate(
            { orderId: order.id, input: { required: !v } },
            {
              onSuccess: () =>
                toast.success(v ? "Payment not required — the client acknowledges the invoice" : "Payment required"),
              onError,
            },
          )
        }
      />
      <span>
        <span className="font-medium">Payment not required</span>
        <span className="text-muted-foreground block text-xs">
          Client billed monthly / annually on account: they only acknowledge the invoice, and the order goes ahead
          without waiting for payment. It stays owed on their account.
        </span>
      </span>
    </label>
  )
}

/** The client's standing account in one line: what's still owed across their invoices. */
function ClientBalance({ order }: { order: Order }) {
  const { data } = useClientAccount(order.clientId, { clientName: order.clientName })
  if (!data || data.summary.balance === 0) return null
  return (
    <p className="text-muted-foreground text-xs">
      <Link href={`/app/billing/accounts/${order.clientId}`} className="hover:text-primary hover:underline">
        {order.clientName} owes {formatMoney(data.summary.balance)}
      </Link>
      {data.summary.overdue > 0 && (
        <span className="text-status-hold"> · {formatMoney(data.summary.overdue)} overdue</span>
      )}
    </p>
  )
}

/** A card payment the portal reported — checked against Stripe (through DocuSoft's proxy). */
function StripeCheck({ reference }: { reference: string }) {
  const tx = useStripeTransaction(reference)
  if (tx.isLoading) return <p className="text-muted-foreground text-xs">Checking the payment in Stripe…</p>
  if (tx.error) return <p className="text-destructive text-xs">Couldn&apos;t check it in Stripe: {tx.error.message}</p>
  const status = String(tx.data?.status ?? "unknown")
  const ok = status === "succeeded"
  return (
    <p className={ok ? "text-status-stored text-xs" : "text-status-hold text-xs"}>
      Stripe: {status}
      {typeof tx.data?.amount === "number" &&
        ` · ${(tx.data.amount / 100).toFixed(2)} ${(tx.data.currency ?? "").toUpperCase()}`}
    </p>
  )
}

/** The order's billing stage: invoice → payment (portal card / recorded by staff) or waived → can be scheduled. */
export function OrderBillingCard({ order }: { order: Order }) {
  const { user } = useAuth()
  const actions = getOrderActions(order, user?.roles ?? [])
  const billing = order.billing ?? (order.status === "billing" ? { status: "awaiting_invoice" as const } : undefined)
  if (!billing) return null
  const atBilling = order.status === "billing"
  const payment = billing.payment

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          Billing
          <Badge variant={SETTLED.includes(billing.status) ? "default" : "outline"}>
            {STATUS_TEXT[billing.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {billing.invoiceId && (
          <p>
            <span className="text-muted-foreground">Invoice</span>{" "}
            <Link href={`/app/billing/${billing.invoiceId}`} className="text-primary hover:underline">
              {billing.invoiceNumber}
            </Link>
            {billing.sageInvoiceNumber && (
              <span className="text-muted-foreground"> · Sage {billing.sageInvoiceNumber}</span>
            )}
          </p>
        )}
        {billing.amount !== undefined && (
          <p>
            <span className="text-muted-foreground">{billing.paymentNotRequired ? "Invoiced" : "To pay"}</span>{" "}
            <span className="font-semibold tabular-nums">{formatMoney(billing.amount)}</span>
            <span className="text-muted-foreground"> incl. VAT</span>
          </p>
        )}
        {billing.status === "awaiting_payment" && (
          <p className="text-muted-foreground text-xs">
            {billing.stripeCustomerId
              ? "The customer can pay by card on the order page in the portal."
              : "This client has no Stripe customer on its DocuSoft card, so card payment in the portal is off — record the payment when it arrives."}
          </p>
        )}
        {billing.status === "awaiting_acknowledgement" && (
          <p className="text-muted-foreground text-xs">
            The client acknowledges the invoice on the order page in the portal — no payment needed to go ahead.
          </p>
        )}
        {billing.acknowledged && (
          <p>
            Acknowledged{" "}
            {billing.acknowledged.via === "portal"
              ? "by the client in the portal"
              : `(recorded by ${billing.acknowledged.by.name})`}{" "}
            · {formatDateTime(billing.acknowledged.at)}
            {billing.acknowledged.note ? (
              <span className="text-muted-foreground"> · {billing.acknowledged.note}</span>
            ) : null}
          </p>
        )}
        {payment && (
          <div className="space-y-1">
            <p>
              Paid {formatMoney(payment.amount)} by {METHOD_TEXT[payment.method].toLowerCase()}
              {payment.via === "portal" ? " in the portal" : payment.via === "sage" ? " (seen in Sage)" : ""} ·{" "}
              {formatDateTime(payment.at)}
            </p>
            <p className="text-muted-foreground text-xs">
              {payment.via === "staff" ? `Recorded by ${payment.by.name}` : `By ${payment.by.name}`}
              {payment.reference ? ` · ref ${payment.reference}` : ""}
              {payment.note ? ` · ${payment.note}` : ""}
            </p>
            {payment.via === "portal" && payment.method === "card" && payment.reference && (
              <StripeCheck reference={payment.reference} />
            )}
          </div>
        )}
        {billing.waived && (
          <p className="text-muted-foreground">
            Waived by {billing.waived.by.name}: {billing.waived.reason}
          </p>
        )}

        <ClientBalance order={order} />

        {atBilling && (actions.canManageBilling || billing.paymentNotRequired) && (
          <PaymentNotRequired order={order} editable={actions.canManageBilling && !SETTLED.includes(billing.status)} />
        )}

        {atBilling && actions.canManageBilling && (
          <div className="flex flex-wrap gap-2 pt-1">
            {billing.status === "awaiting_invoice" && (
              <Button size="sm" nativeButton={false} render={<Link href={`/app/billing/new?orderId=${order.id}`} />}>
                Raise invoice
              </Button>
            )}
            {billing.status === "invoice_draft" && billing.invoiceId && (
              <Button size="sm" nativeButton={false} render={<Link href={`/app/billing/${billing.invoiceId}`} />}>
                Send invoice to Sage
              </Button>
            )}
            {billing.status === "awaiting_payment" && <RecordPaymentDialog order={order} />}
            {billing.status === "awaiting_acknowledgement" && <AcknowledgeDialog order={order} />}
            {!SETTLED.includes(billing.status) && <WaiveDialog order={order} />}
          </div>
        )}
        {atBilling && !actions.canManageBilling && actions.waitingForPayment && (
          <p className="text-muted-foreground text-xs">Finance raises the invoice and records the payment.</p>
        )}
      </CardContent>
    </Card>
  )
}
