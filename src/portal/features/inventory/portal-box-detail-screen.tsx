"use client"

import { formatDate, formatDateRange } from "@/lib/formatting"
import Link from "next/link"
import { notFound } from "next/navigation"

import { usePortalBox, usePortalBoxHistory } from "@/api/portal"
import { PortalBoxStatusBadge } from "@/components/status-badge"
import { AuditTimeline } from "@/components/audit-timeline"
import { Skeleton } from "@/components/ui/skeleton"

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  )
}

export function PortalBoxDetailScreen({ boxId }: { boxId: string }) {
  const { data: box, isLoading, isError } = usePortalBox(boxId)
  const { data: history } = usePortalBoxHistory(boxId)

  // Not this client's box (or it doesn't exist) — the mock scopes /portal/boxes/:id to the
  // session's own client (spec §2), so a wrong ID renders 404, never someone else's data.
  if (isError) notFound()
  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!box) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{box.boxNumber}</h1>
        <PortalBoxStatusBadge status={box.status} />
      </div>

      {box.openOrder && (
        <Link
          href={`/portal/orders/${box.openOrder.id}`}
          className="bg-primary/5 border-primary/20 text-primary block w-fit rounded-lg border px-4 py-2 hover:underline"
        >
          On order {box.openOrder.orderNumber} — {box.openOrder.status}
        </Link>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <dl className="space-y-4">
          <Field label="Description" value={box.description} />
          <Field label="Filing dates" value={formatDateRange(box.filingDateFrom, box.filingDateTo)} />
          <Field label="Warehouse" value={box.locationPath?.warehouse ?? "Not yet stored"} />
          <Field label="Received" value={formatDate(box.createdAt)} />
        </dl>

        <div>
          <h2 className="mb-3 font-semibold">History</h2>
          <AuditTimeline events={history ?? []} audience="client" />
        </div>
      </div>
    </div>
  )
}
