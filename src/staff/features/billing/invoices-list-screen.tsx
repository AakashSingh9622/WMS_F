"use client"

import Link from "next/link"
import { useState } from "react"

import { useInvoices, type InvoiceStatus } from "@/api/invoices"
import { useCan } from "@/auth/useAuth"
import { useDebounce } from "@/hooks/useDebounce"
import { formatDate, formatDateRange, formatMoney } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PaginationFooter } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { InvoiceStatusBadge } from "@/staff/features/billing/invoice-status-badge"

const PAGE_SIZE = 25
const TABS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "issued", label: "In Sage" },
]

export function InvoicesListScreen() {
  const canManage = useCan("billing.manage")
  const [tab, setTab] = useState<InvoiceStatus | "all">("all")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const search = useDebounce(q, 300)
  const { data, isLoading } = useInvoices({
    status: tab === "all" ? undefined : tab,
    q: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Invoice}
        title="Invoices"
        description="Warehouse invoices, prepared here and created in Sage One."
        className="shrink-0"
        actions={
          canManage ? (
            <Button nativeButton={false} render={<Link href="/app/billing/new" />}>
              New invoice
            </Button>
          ) : undefined
        }
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={tab === t.value ? "default" : "outline"}
            onClick={() => {
              setTab(t.value)
              setPage(1)
            }}
          >
            {t.label}
          </Button>
        ))}
        <Input
          className="ml-auto w-64"
          placeholder="Search number or client"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <div className="bg-card min-h-0 flex-1 overflow-y-auto rounded-2xl border shadow-xs">
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-6 text-sm">
            No invoices yet.{canManage ? " Use “New invoice” to prepare one." : ""}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Invoice date</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link href={`/app/billing/${inv.id}`} className="text-primary font-medium hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{inv.clientName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {inv.periodFrom ? formatDateRange(inv.periodFrom, inv.periodTo) : "—"}
                  </TableCell>
                  <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(inv.netTotal)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.sageLink ? (
                      <a href={inv.sageLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {inv.sageInvoiceNumber ?? "Open"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
