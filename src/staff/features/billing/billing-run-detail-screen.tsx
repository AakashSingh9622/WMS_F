"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useApproveBillingRun, useBillingRun, useDiscardBillingRun } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { formatDate, formatDateRange, formatDateTime, formatMoney } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

export function BillingRunDetailScreen({ runId }: { runId: string }) {
  const router = useRouter()
  const canManage = useCan("billing.manage")
  const { data: run, isLoading, error } = useBillingRun(runId)
  const approve = useApproveBillingRun()
  const discard = useDiscardBillingRun()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (error || !run) return <p className="text-muted-foreground text-sm">Billing run not found.</p>

  const isDraft = run.status === "draft"

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        icon={Invoice}
        title={
          <span className="flex items-center gap-2">
            {run.runNumber}
            <Badge variant={isDraft ? "outline" : "default"}>{isDraft ? "Draft" : "Approved"}</Badge>
          </span>
        }
        description={`Charges up to ${formatDate(run.periodEnd)} (period ${formatDateRange(run.periodStart, run.periodEnd)}).`}
        actions={
          canManage && isDraft ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={discard.isPending}
                onClick={() =>
                  discard.mutate(run.id, {
                    onSuccess: () => (
                      toast.success("Run discarded — its charges are open again"),
                      router.push("/app/billing/runs")
                    ),
                    onError,
                  })
                }
              >
                Discard
              </Button>
              <Button
                disabled={approve.isPending || !run.charges?.length}
                onClick={() =>
                  approve.mutate(run.id, {
                    onSuccess: (r) => toast.success(`${r.invoices.length} draft invoices created`),
                    onError,
                  })
                }
              >
                {approve.isPending ? "Creating invoices…" : "Approve & create invoices"}
              </Button>
            </div>
          ) : undefined
        }
      />

      <p className="text-muted-foreground text-sm">
        Started by {run.createdBy.name}, {formatDateTime(run.createdAt)}
        {run.approvedBy && ` · approved by ${run.approvedBy.name}, ${formatDateTime(run.approvedAt ?? "")}`}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Per client</CardTitle>
          </CardHeader>
          <CardContent>
            {!run.totals?.clients.length ? (
              <p className="text-muted-foreground text-sm">No charges in this run.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.totals.clients.map((c) => (
                    <TableRow key={c.clientId}>
                      <TableCell>{c.clientName}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.charges}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(run.totals.amount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {!!run.invoices?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {run.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 py-2">
                    <Link href={`/app/billing/${inv.id}`} className="text-primary font-medium hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                    <span className="flex-1">{inv.clientName}</span>
                    <span className="tabular-nums">{formatMoney(inv.netTotal)}</span>
                    <Badge variant="outline" className="capitalize">
                      {inv.status}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">Open each to check it and send it to Sage.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {!!run.charges?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Charges ({run.charges.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.charges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.clientName}</TableCell>
                    <TableCell className="max-w-80 truncate" title={c.description}>
                      {c.description}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {c.periodStart === c.periodEnd
                        ? formatDate(c.periodStart)
                        : formatDateRange(c.periodStart, c.periodEnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
