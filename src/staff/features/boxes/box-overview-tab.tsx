"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"

import { useBox } from "@/api/boxes"
import { useAuditSearch } from "@/api/audit"
import { boxLengthCm } from "@/domain/dimensions"
import { AuditTimeline } from "@/components/audit-timeline"
import { Skeleton } from "@/components/ui/skeleton"

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  )
}

export function BoxOverviewTab({ boxId }: { boxId: string }) {
  const { data: box, isLoading } = useBox(boxId)
  const { data: audit } = useAuditSearch({ boxId, pageSize: 5 })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!box) return null

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Identity</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Box number" value={box.boxNumber} />
            <Field label="Barcode" value={box.barcode} />
            <Field label="Client" value={box.clientName} />
            <Field
              label="Size"
              value={`${box.size === "large" ? "Large" : "Standard"} (${box.lengthCm ?? boxLengthCm(box.size)} cm)`}
            />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Contents</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Description" value={box.description} />
            <Field label="Department" value={box.department} />
            <Field label="Reference" value={box.reference} />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Dates</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Filing from" value={formatDate(box.filingDateFrom)} />
            <Field label="Filing to" value={box.filingDateTo ? formatDate(box.filingDateTo) : undefined} />
            <Field label="Destroy after" value={box.destroyAfter ? formatDate(box.destroyAfter) : undefined} />
            <Field label="Retention category" value={box.retentionCategory} />
            <Field label="Registered" value={formatDate(box.createdAt)} />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Location</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Warehouse" value={box.locationPath?.warehouse ?? "Not allocated"} />
            <Field label="Rack" value={box.locationPath?.rack} />
            <Field label="Slot" value={box.locationPath?.slot} />
          </dl>
        </section>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link
            href={`/app/boxes/${boxId}/history`}
            className="text-primary text-xs underline-offset-2 hover:underline"
          >
            View all
          </Link>
        </div>
        <AuditTimeline events={audit?.items ?? []} orderHref={(id) => `/app/orders/${id}`} />
      </div>
    </div>
  )
}
