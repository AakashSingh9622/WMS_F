"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useBillingRuns, useCreateBillingRun } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { formatDateRange, formatDateTime, formatMoney, todayISO } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** Last calendar month — the usual billing period. */
function lastMonth() {
  const today = new Date(`${todayISO()}T00:00:00Z`)
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

function NewRunDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(lastMonth)
  const create = useCreateBillingRun()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New billing run</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New billing run</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="br-from">From</FieldLabel>
            <Input
              id="br-from"
              type="date"
              value={period.from}
              onChange={(e) => setPeriod({ ...period, from: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="br-to">To</FieldLabel>
            <Input
              id="br-to"
              type="date"
              value={period.to}
              onChange={(e) => setPeriod({ ...period, to: e.target.value })}
            />
          </Field>
        </div>
        <FieldDescription>
          Works out the period&apos;s charges, then gathers every open charge up to its end into a draft you can check.
          Nothing is invoiced until you approve it.
        </FieldDescription>
        <DialogFooter>
          <Button
            disabled={!period.from || !period.to || create.isPending}
            onClick={() =>
              create.mutate(period, {
                onSuccess: (run) => router.push(`/app/billing/runs/${run.id}`),
                onError: (err) => toast.error(err instanceof Error ? err.message : "Could not start the run"),
              })
            }
          >
            {create.isPending ? "Working…" : "Start run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Billing runs (spec §4.6): a period's open charges → reviewed → one draft invoice per client on approval. */
export function BillingRunsScreen() {
  const canManage = useCan("billing.manage")
  const { data, isLoading } = useBillingRuns()

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Invoice}
        title="Billing runs"
        description="Turn a period's charges into invoices — one per client, sent to Sage the usual way."
        className="shrink-0"
        actions={canManage ? <NewRunDialog /> : undefined}
      />
      <div className="bg-card min-h-0 flex-1 overflow-y-auto rounded-2xl border shadow-xs">
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-6 text-sm">No billing runs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/app/billing/runs/${r.id}`} className="text-primary font-medium hover:underline">
                      {r.runNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateRange(r.periodStart, r.periodEnd)}</TableCell>
                  <TableCell className="tabular-nums">{r.totals?.clients.length ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.totals ? formatMoney(r.totals.amount) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "approved" ? "default" : "outline"}>
                      {r.status === "approved" ? "Approved" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.createdBy.name}, {formatDateTime(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
