"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"

import { useBox } from "@/api/boxes"
import { useAuditSearch } from "@/api/audit"
import { boxLengthCm } from "@/domain/dimensions"
import { useBoxSizeName } from "@/api/settings"
import { shelfAndPosition } from "@/domain/location"
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
  const sizeName = useBoxSizeName()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!box) return null
  const place =
    box.locationPath && box.locationPath.rack !== "Goods-In" ? shelfAndPosition(box.locationPath) : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Identity</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Box number" value={box.boxNumber} />
            <Field label="Barcode" value={box.barcode} />
            <Field label="Client" value={box.clientName} />
            <Field label="Size" value={`${sizeName(box.size)} (${box.lengthCm ?? boxLengthCm(box.size)} cm)`} />
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
            {box.locationPath?.zone && <Field label="Zone" value={box.locationPath.zone} />}
            {box.locationPath?.aisle && <Field label="Aisle" value={box.locationPath.aisle} />}
            <Field label="Rack" value={box.locationPath?.rack} />
            <Field label="Shelf" value={place?.shelf?.toString()} />
            <Field label="Position" value={place?.position?.toString()} />
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
