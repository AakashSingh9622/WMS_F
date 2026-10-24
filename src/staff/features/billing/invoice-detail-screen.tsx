"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import {
  useDeleteInvoice,
  useInvalidateInvoice,
  useInvoice,
  useSageSettings,
  type Invoice as InvoiceData,
} from "@/api/invoices"
import { SAGE_NOT_ACTIVE, SAGE_TAX_RATES, SageError } from "@/api/sage"
import { useStripePayments } from "@/api/stripe"
import { useCan } from "@/auth/useAuth"
import {
  projectIdOf,
  useGetClientAddressesQuery,
  useGetClientCardQuery,
  useGetClientsWithDetailsQuery,
} from "@/store/docusoftApi"
import { formatDate, formatDateRange, formatDateTime, formatMoney } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { InvoiceForm } from "@/staff/features/billing/invoice-form"
import { InvoiceStatusBadge } from "@/staff/features/billing/invoice-status-badge"
import { RecordInvoicePaymentDialog } from "@/staff/features/billing/record-invoice-payment"
import { AccountingSystemDialog } from "@/staff/features/billing/accounting-system-dialog"
import {
  SageConnectionBar,
  useActiveAccountingSystem,
  useSageConnection,
  useSageLedgerAccounts,
} from "@/staff/features/billing/sage-connection"
import { SEND_STEP_LABEL, sendInvoiceToSage, type SendStep } from "@/staff/features/billing/send-to-sage"

function SendToSagePanel({ invoice }: { invoice: InvoiceData }) {
  // 1. the practice's active accounting system decides everything below: not Sage One → no connecting, no sending
  const accounting = useActiveAccountingSystem()
  const sageActive = accounting.data === "SageOne"
  const [notActiveOpen, setNotActiveOpen] = useState(false)
  const connection = useSageConnection()
  const ledgers = useSageLedgerAccounts(connection.connected && sageActive)
  // (send() re-checks the accounting system itself — this cached answer only decides what the panel shows)
  const { data: settings } = useSageSettings()
  const { data: clients } = useGetClientsWithDetailsQuery()
  const { data: addresses } = useGetClientAddressesQuery(invoice.clientId)
  const refresh = useInvalidateInvoice()
  const [ledgerPick, setLedgerPick] = useState<string>()
  const [step, setStep] = useState<SendStep | null>(null)

  const ledgerId = ledgerPick ?? settings?.defaultLedgerAccountId ?? ""
  const ledgerName = (id: string) =>
    ledgers.data?.find((l) => l.id === id)?.displayed_as ??
    (id === settings?.defaultLedgerAccountId ? settings.defaultLedgerAccountName : null) ??
    id
  const projectId = projectIdOf(clients?.find((c) => c.ClientId === invoice.clientId))
  // An order's invoice: the client's Stripe customer (DocuSoft card) lets the customer pay it by card in the portal.
  const { data: card } = useGetClientCardQuery(
    { projectId: projectId ?? 0, clientId: invoice.clientId },
    { skip: !projectId || !invoice.orderId },
  )
  const stripeCustomerId = String(card?.Table1?.[0]?.StripeCustomerId ?? "").trim() || undefined
  const address = addresses?.[0]
  const sendingNow = invoice.status === "sending"

  async function send() {
    setStep(null)
    try {
      const { invoice: issued, warning } = await sendInvoiceToSage({
        invoice,
        projectId,
        ledgerAccountId: ledgerId,
        address: address && {
          line1: address.Add1,
          line2: address.Add2,
          city: address.Town,
          postcode: address.Postcode,
        },
        stripeCustomerId,
        onStep: setStep,
      })
      refresh(issued)
      toast.success(`Created in Sage${issued.sageInvoiceNumber ? ` as ${issued.sageInvoiceNumber}` : ""}`)
      if (warning) toast.warning(warning)
    } catch (err) {
      refresh()
      if (err instanceof SageError && err.code === SAGE_NOT_ACTIVE) {
        // switched away from Sage One since the page loaded — nothing was sent
        void accounting.refetch()
        setNotActiveOpen(true)
      } else {
        toast.error(err instanceof Error ? err.message : "Sending to Sage failed")
      }
    } finally {
      setStep(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Send to Sage One</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AccountingSystemDialog open={notActiveOpen} onOpenChange={setNotActiveOpen} />
        {accounting.isPending ? (
          <p className="text-muted-foreground text-sm">Checking the practice&apos;s accounting system…</p>
        ) : accounting.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-destructive text-sm">
              Could not check the practice&apos;s accounting system: {accounting.error.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => accounting.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <SageConnectionBar
              connection={connection}
              onConnect={sageActive ? undefined : () => setNotActiveOpen(true)}
            />
            {!sageActive && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setNotActiveOpen(true)}>Send to Sage</Button>
                <span className="text-muted-foreground text-sm">
                  Sage One is not the practice&apos;s active accounting system.
                </span>
              </div>
            )}
          </>
        )}
        {connection.connected && sageActive && (
          <>
            <Field>
              <FieldLabel htmlFor="send-ledger">Ledger account for the lines</FieldLabel>
              <Select value={ledgerId} onValueChange={(v) => setLedgerPick(v ?? "")}>
                <SelectTrigger id="send-ledger">
                  <SelectValue placeholder="Choose a ledger account" getLabel={(id) => (id ? ledgerName(id) : "")} />
                </SelectTrigger>
                <SelectContent>
                  {ledgers.data?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.displayed_as}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ledgers.error && <p className="text-destructive text-xs">{ledgers.error.message}</p>}
            </Field>
            {!projectId && (
              <p className="text-muted-foreground text-xs">
                Loading the client&apos;s DocuSoft folder… (open Clients once if this doesn&apos;t clear)
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!ledgerId || !projectId || step !== null} onClick={send}>
                {step ? "Sending…" : sendingNow ? "Try sending again" : "Send to Sage"}
              </Button>
              {step && <span className="text-muted-foreground text-sm">{SEND_STEP_LABEL[step]}</span>}
            </div>
            <p className="text-muted-foreground text-xs">
              The client is matched to its Sage contact through DocuSoft (the same link Practice uses); a missing
              contact is created from the client&apos;s DocuSoft address. Sending twice never makes two Sage invoices —
              the WMS invoice number is the Sage reference and is checked first.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StripePaymentsCard({ invoice }: { invoice: InvoiceData }) {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const projectId = projectIdOf(clients?.find((c) => c.ClientId === invoice.clientId))
  const { data: card } = useGetClientCardQuery(
    { projectId: projectId ?? 0, clientId: invoice.clientId },
    { skip: !projectId },
  )
  const customerId = String(card?.Table1?.[0]?.StripeCustomerId ?? "").trim() || undefined
  const payments = useStripePayments(customerId)
  if (!customerId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Stripe payments of this client</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : payments.error ? (
          <p className="text-destructive text-sm">{payments.error.message}</p>
        ) : !payments.data?.length ? (
          <p className="text-muted-foreground text-sm">No Stripe payments yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.created ? formatDate(new Date(p.created * 1000).toISOString()) : "—"}</TableCell>
                  <TableCell>{p.description ?? p.id}</TableCell>
                  <TableCell>{p.status ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {typeof p.amount === "number"
                      ? `${(p.amount / 100).toFixed(2)} ${(p.currency ?? "").toUpperCase()}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          Read from Stripe through DocuSoft (the client&apos;s Stripe customer on its DocuSoft card). Matching payments
          to invoices comes later.
        </p>
      </CardContent>
    </Card>
  )
}

export function InvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const canManage = useCan("billing.manage")
  const { data: invoice, isLoading } = useInvoice(invoiceId)
  const remove = useDeleteInvoice()
  const [editing, setEditing] = useState(false)

  if (isLoading || !invoice) return <Skeleton className="h-96 w-full max-w-4xl" />
  if (editing) {
    return (
      <div className="max-w-5xl space-y-4">
        <PageHeader icon={Invoice} title={`Edit ${invoice.invoiceNumber}`} />
        <InvoiceForm invoice={invoice} />
      </div>
    )
  }

  const taxLabel = (id: string) => SAGE_TAX_RATES.find((t) => t.id === id)?.label ?? id
  const isDraft = invoice.status === "draft"

  async function deleteDraft() {
    if (!window.confirm(`Delete draft ${invoice?.invoiceNumber}?`)) return
    try {
      await remove.mutateAsync(invoiceId)
      toast.success("Draft deleted")
      router.push("/app/billing")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete the draft")
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        icon={Invoice}
        title={invoice.invoiceNumber}
        description={
          invoice.orderId ? (
            <>
              {invoice.clientName} · for{" "}
              <Link href={`/app/orders/${invoice.orderId}`} className="text-primary hover:underline">
                the order
              </Link>{" "}
              at its billing stage
              {invoice.grossTotal !== undefined && ` · to pay ${formatMoney(invoice.grossTotal)} incl. VAT`}
            </>
          ) : (
            `${invoice.clientName} · ${invoice.periodFrom ? formatDateRange(invoice.periodFrom, invoice.periodTo) : "no period"}`
          )
        }
        actions={
          canManage && isDraft ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" disabled={remove.isPending} onClick={deleteDraft}>
                Delete
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <InvoiceStatusBadge status={invoice.status} />
        <span>
          <span className="text-muted-foreground">Invoice date</span> {formatDate(invoice.invoiceDate)}
        </span>
        <span>
          <span className="text-muted-foreground">Due</span> {formatDate(invoice.dueDate)}
        </span>
        <span>
          <span className="text-muted-foreground">Net</span>{" "}
          <span className="font-semibold tabular-nums">{formatMoney(invoice.netTotal)}</span>
        </span>
        <span className="text-muted-foreground">
          Prepared by {invoice.createdBy.name}, {formatDateTime(invoice.createdAt)}
        </span>
      </div>

      {invoice.status === "issued" && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
            <Badge>In Sage</Badge>
            <span>
              {invoice.sageInvoiceNumber ? `Sage invoice ${invoice.sageInvoiceNumber}` : "Created in Sage"}
              {invoice.issuedAt && ` on ${formatDateTime(invoice.issuedAt)}`}
              {invoice.issuedBy && ` by ${invoice.issuedBy.name}`}
            </span>
            {invoice.sageLink && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                nativeButton={false}
                render={<a href={invoice.sageLink} target="_blank" rel="noreferrer" />}
              >
                Open in Sage
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {invoice.status === "issued" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              Payments
              {invoice.paidAt ? (
                <Badge>Paid</Badge>
              ) : (
                <Badge variant="outline">{formatMoney(invoice.outstanding ?? 0)} owed</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Total</span>{" "}
              <span className="tabular-nums">{formatMoney(invoice.grossTotal ?? invoice.netTotal)}</span>
              <span className="text-muted-foreground"> · paid</span>{" "}
              <span className="tabular-nums">{formatMoney(invoice.amountPaid ?? 0)}</span>
              {invoice.sageSyncedAt && (
                <span className="text-muted-foreground"> · checked in Sage {formatDateTime(invoice.sageSyncedAt)}</span>
              )}
            </p>
            {invoice.payments?.map((p, i) => (
              <p key={i} className="text-muted-foreground text-xs">
                {formatDateTime(p.at)} · {formatMoney(p.amount)} · {p.method.replace("_", " ")}
                {p.via === "portal"
                  ? " (portal card)"
                  : p.via === "sage"
                    ? " (seen in Sage)"
                    : ` (recorded by ${p.by.name})`}
                {p.reference ? ` · ref ${p.reference}` : ""}
              </p>
            ))}
            {canManage && !invoice.paidAt && (invoice.outstanding ?? 0) > 0 && (
              <RecordInvoicePaymentDialog
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                outstanding={invoice.outstanding ?? 0}
              />
            )}
          </CardContent>
        </Card>
      )}

      {invoice.lastError && invoice.status !== "issued" && (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
          Last attempt to send to Sage failed: {invoice.lastError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.lines ?? []).map((l, i) => (
                <TableRow key={l.id ?? i}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                  <TableCell>{taxLabel(l.taxRateId)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(Math.round(l.quantity * l.unitPrice * 100) / 100)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {invoice.notes && <p className="text-muted-foreground mt-3 text-sm">Notes: {invoice.notes}</p>}
        </CardContent>
      </Card>

      {canManage && invoice.status !== "issued" && <SendToSagePanel invoice={invoice} />}
      <StripePaymentsCard invoice={invoice} />
    </div>
  )
}
