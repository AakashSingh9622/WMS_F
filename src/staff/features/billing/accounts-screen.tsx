"use client"

import Link from "next/link"
import { useState } from "react"

import { useAccounts } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { useDebounce } from "@/hooks/useDebounce"
import { formatDate, formatDateTime, formatMoney } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PaginationFooter } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PeriodPicker, thisYear, type Period } from "@/staff/features/billing/period-picker"
import { UpdateFromSageButton } from "@/staff/features/billing/record-invoice-payment"

const PAGE_SIZE = 50

/**
 * Clients' standing accounts: for the invoices sent to Sage in the period — how many were raised, how many are paid,
 * invoiced / paid / still owed — plus each client's whole balance (and how much of it is overdue).
 */
export function AccountsScreen() {
  const canManage = useCan("billing.manage")
  const [period, setPeriod] = useState<Period>(thisYear)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const search = useDebounce(q, 300)
  const { data, isLoading } = useAccounts({ ...period, q: search || undefined, page, pageSize: PAGE_SIZE })
  const lastSync = data?.items.reduce<string | undefined>(
    (latest, a) => (a.lastSyncedAt && (!latest || a.lastSyncedAt > latest) ? a.lastSyncedAt : latest),
    undefined,
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Invoice}
        title="Accounts"
        description="What each client was invoiced, has paid and still owes. Payments come from the portal, from staff, and from Sage."
        className="shrink-0"
        actions={canManage ? <UpdateFromSageButton /> : undefined}
      />

      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <PeriodPicker value={period} onChange={(p) => (setPeriod(p), setPage(1))} />
        <Input
          className="ml-auto w-64"
          placeholder="Search client"
          value={q}
          onChange={(e) => (setQ(e.target.value), setPage(1))}
        />
      </div>

      {data && (
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Invoiced in the period", value: data.totals.invoiced },
            { label: "Paid", value: data.totals.paid },
            { label: "Owed on the period's invoices", value: data.totals.outstanding },
            { label: "Total owed (all invoices)", value: data.totals.balance, strong: true },
            { label: "Of which overdue", value: data.totals.overdue, warn: data.totals.overdue > 0 },
          ].map((t) => (
            <div key={t.label} className="bg-card rounded-2xl border p-3">
              <p className="text-muted-foreground text-xs">{t.label}</p>
              <p
                className={`text-lg tabular-nums ${t.strong ? "font-semibold" : ""} ${t.warn ? "text-status-hold" : ""}`}
              >
                {formatMoney(t.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card min-h-0 flex-1 overflow-y-auto rounded-2xl border shadow-xs">
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-6 text-sm">No invoices in Sage yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Unpaid</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Paid £</TableHead>
                <TableHead className="text-right">Owed (period)</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead>Last invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((a) => (
                <TableRow key={a.clientId}>
                  <TableCell>
                    <Link
                      href={`/app/billing/accounts/${encodeURIComponent(a.clientId)}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {a.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.invoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.paidInvoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.unpaidInvoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.invoiced)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.outstanding)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(a.balance)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${a.overdue > 0 ? "text-status-hold" : ""}`}>
                    {a.overdue > 0 ? formatMoney(a.overdue) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{a.lastInvoiceDate ? formatDate(a.lastInvoiceDate) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {lastSync ? `Last updated from Sage ${formatDateTime(lastSync)}` : "Not updated from Sage yet"}
        </p>
        <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </div>
    </div>
  )
}
