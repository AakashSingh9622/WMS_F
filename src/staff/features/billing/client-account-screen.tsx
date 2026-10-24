"use client"

import Link from "next/link"
import { useState } from "react"

import { useClientAccount, type AccountInvoice } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { formatDate, formatMoney } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PeriodPicker, thisYear, type Period } from "@/staff/features/billing/period-picker"
import { RecordInvoicePaymentDialog, UpdateFromSageButton } from "@/staff/features/billing/record-invoice-payment"

function PaidBadge({ inv }: { inv: AccountInvoice }) {
  if (inv.isPaid) return <Badge>Paid</Badge>
  if (inv.overdue)
    return (
      <Badge variant="outline" className="border-status-hold text-status-hold">
        Overdue
      </Badge>
    )
  if (inv.paid > 0) return <Badge variant="outline">Part paid</Badge>
  return <Badge variant="outline">Unpaid</Badge>
}

function InvoiceRows({ items, canManage }: { items: AccountInvoice[]; canManage: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Owed</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell>
              <Link href={`/app/billing/${inv.id}`} className="text-primary font-medium hover:underline">
                {inv.invoiceNumber}
              </Link>
              {inv.sageInvoiceNumber && (
                <span className="text-muted-foreground text-xs"> · Sage {inv.sageInvoiceNumber}</span>
              )}
              {inv.orderId && (
                <Link
                  href={`/app/orders/${inv.orderId}`}
                  className="text-muted-foreground block text-xs hover:underline"
                >
                  order invoice
                </Link>
              )}
            </TableCell>
            <TableCell className="text-sm">{formatDate(inv.invoiceDate)}</TableCell>
            <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(inv.total)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(inv.paid)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {inv.outstanding ? formatMoney(inv.outstanding) : "—"}
            </TableCell>
            <TableCell>
              <PaidBadge inv={inv} />
            </TableCell>
            <TableCell>
              {canManage && !inv.isPaid && (
                <RecordInvoicePaymentDialog
                  invoiceId={inv.id}
                  invoiceNumber={inv.invoiceNumber}
                  outstanding={inv.outstanding}
                  size="xs"
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** One client's statement: the period's invoices with what's paid / owed, and older invoices still unpaid. */
export function ClientAccountScreen({ clientId }: { clientId: string }) {
  const canManage = useCan("billing.manage")
  const { data: clients } = useGetClientsWithDetailsQuery()
  const clientName = clients?.find((c) => c.ClientId === clientId)?.Client
  const [period, setPeriod] = useState<Period>(thisYear)
  const { data, isLoading } = useClientAccount(clientId, { ...period, clientName })

  if (isLoading || !data) return <Skeleton className="h-64 w-full max-w-5xl" />
  const s = data.summary

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        icon={Invoice}
        title={clientName ?? s.clientName}
        description="Standing account — invoices in Sage, what's paid and what's still owed."
        actions={
          <div className="flex gap-2">
            {canManage && <UpdateFromSageButton clientId={clientId} />}
            {canManage && (
              <Button
                nativeButton={false}
                render={<Link href={`/app/billing/new?clientId=${encodeURIComponent(clientId)}`} />}
              >
                New invoice
              </Button>
            )}
          </div>
        }
      />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: "Invoices in the period",
            text: `${s.invoices} (${s.paidInvoices} paid, ${s.unpaidInvoices} unpaid)`,
          },
          { label: "Invoiced", text: formatMoney(s.invoiced) },
          { label: "Paid", text: formatMoney(s.paid) },
          { label: "Owed (period)", text: formatMoney(s.outstanding) },
          { label: "Balance (all invoices)", text: formatMoney(s.balance), strong: true },
          { label: "Overdue", text: s.overdue > 0 ? formatMoney(s.overdue) : "—", warn: s.overdue > 0 },
        ].map((t) => (
          <div key={t.label} className="bg-card rounded-2xl border p-3">
            <p className="text-muted-foreground text-xs">{t.label}</p>
            <p
              className={`tabular-nums ${t.strong ? "text-lg font-semibold" : ""} ${t.warn ? "text-status-hold" : ""}`}
            >
              {t.text}
            </p>
          </div>
        ))}
      </div>
      {data.drafts > 0 && (
        <p className="text-muted-foreground text-xs">
          {data.drafts} draft invoice{data.drafts === 1 ? "" : "s"} not in Sage yet (not counted).
        </p>
      )}

      <div className="bg-card rounded-2xl border">
        {data.items.length ? (
          <InvoiceRows items={data.items} canManage={canManage} />
        ) : (
          <p className="text-muted-foreground p-4 text-sm">No invoices in this period.</p>
        )}
      </div>

      {data.earlierUnpaid.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Still owed from before the period</h2>
          <div className="bg-card rounded-2xl border">
            <InvoiceRows items={data.earlierUnpaid} canManage={canManage} />
          </div>
        </div>
      )}
    </div>
  )
}
