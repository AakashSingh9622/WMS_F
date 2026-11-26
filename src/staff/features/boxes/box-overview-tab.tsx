"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"

import { useBox } from "@/api/boxes"
import { useAuditSearch } from "@/api/audit"
import { useCustomFields } from "@/api/customFields"
import { DEFAULT_DEPTH_CM, DEFAULT_HEIGHT_CM, BOX_LENGTH_CM, boxVolume, formatDimensions, formatVolume } from "@/domain/dimensions"
import { useBoxSizeName } from "@/api/settings"
import { shelfAndPosition } from "@/domain/location"
import { AuditTimeline } from "@/components/audit-timeline"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxPlacement } from "@/staff/features/boxes/box-placement"
import { useReferenceUdfFields } from "@/staff/features/boxes/register/reference-udf-section"

function Field({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">
        {value && href ? (
          <Link href={href} className="hover:text-primary underline-offset-2 hover:underline">
            {value}
          </Link>
        ) : (
          value || "—"
        )}
      </dd>
    </div>
  )
}

/** A link to Find a box filtered to a place. */
const findLink = (filters: Record<string, string | undefined>) => {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) sp.set(key, value)
  return `/app/boxes?${sp.toString()}`
}

export function BoxOverviewTab({ boxId }: { boxId: string }) {
  const { data: box, isLoading } = useBox(boxId)
  const { data: audit } = useAuditSearch({ boxId, pageSize: 5 })
  const sizeName = useBoxSizeName()
  const { data: fieldDefs } = useCustomFields(box?.clientId ?? "", { includeInactive: true })
  // The client's own fields that this box has a value for, in the client's order (dates shown like the others).
  const customRows = (fieldDefs ?? []).flatMap((f) => {
    const raw = box?.customFields?.[f.code]
    if (raw === undefined || raw === "") return []
    return [{ code: f.code, name: f.name, value: f.fieldType === "date" ? formatDate(String(raw)) : String(raw) }]
  })

  // The client's DocuSoft Reference UDFs (its fields, in DocuSoft's order, "—" when empty), then any value this box
  // keeps for a field DocuSoft no longer has. Edited with "Edit details".
  const reference = useReferenceUdfFields(box?.clientId ?? "")
  const stored = box?.referenceUdfs ?? {}
  const show = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v)
  const referenceRows = [
    ...reference.fields.map((f) => ({ name: f.name, value: show(stored[f.name]) })),
    ...Object.entries(stored)
      .filter(([name]) => !reference.fields.some((f) => f.name === name))
      .map(([name, value]) => ({ name, value: show(value) })),
  ]

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
            {box.expedienteCode && <Field label="Expediente" value={box.expedienteCode} />}
            <Field label="Size" value={`${sizeName(box.size)} (${formatDimensions(box.lengthCm ?? BOX_LENGTH_CM[box.size] ?? BOX_LENGTH_CM.standard, box.heightCm ?? DEFAULT_HEIGHT_CM, box.depthCm ?? DEFAULT_DEPTH_CM)} · ${formatVolume(boxVolume(box))})`} />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Contents</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Description" value={box.description} />
            <Field label="Department" value={box.department} />
            <Field label="Reference" value={box.reference} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Comments" value={box.comments} />
            </div>
          </dl>
        </section>

        {customRows.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Client&apos;s own fields</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {customRows.map((f) => (
                <Field key={f.code} label={f.name} value={f.value} />
              ))}
            </dl>
          </section>
        )}

        {referenceRows.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Reference UDF</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {referenceRows.map((r) => (
                <Field key={r.name} label={r.name} value={r.value} />
              ))}
            </dl>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Dates</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Filing from" value={formatDate(box.filingDateFrom)} />
            <Field label="Filing to" value={box.filingDateTo ? formatDate(box.filingDateTo) : undefined} />
            <Field label="Destroy after" value={box.destroyAfter ? formatDate(box.destroyAfter) : undefined} />
            <Field label="Retention category" value={box.retentionCategory} />
            <Field label="Entry date" value={formatDate(box.entryDate ?? box.createdAt)} />
            <Field label="Registered" value={formatDate(box.createdAt)} />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Location</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Site (Sede)" value={box.locationPath?.site} href={findLink({ site: box.locationPath?.site })} />
            <Field label="Warehouse" value={box.locationPath?.warehouse ?? "Not allocated"} href={findLink({ wh: box.locationPath?.warehouse })} />
            {/* The client's (Docbox) names first, ours in brackets. Each part opens Find a box for that place. */}
            <Field label="Block / Floor (zone)" value={box.locationPath?.zone} href={findLink({ wh: box.locationPath?.warehouse, zone: box.locationPath?.zone })} />
            <Field label="Aisle" value={box.locationPath?.aisle} href={findLink({ wh: box.locationPath?.warehouse, zone: box.locationPath?.zone, aisle: box.locationPath?.aisle })} />
            <Field label="Shelving unit / Module (rack)" value={box.locationPath?.rack} href={findLink({ module: box.locationPath?.rack })} />
            <Field label="Row / Shelf" value={place?.shelf?.toString()} href={findLink({ module: box.locationPath?.rack, shelf: place?.shelf?.toString() })} />
            <Field label="Position" value={place?.position?.toString()} />
            <Field label="Pallet number" value={box.palletNo} />
            <Field label="Container number" value={box.containerNo} />
            <Field label="Container type" value={box.containerType} />
          </dl>
        </section>

        <section className="space-y-2">
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
        </section>
      </div>

      {/* where the box stands, beside the details; stays in view while the details scroll */}
      <div className="lg:sticky lg:top-0 lg:self-start">
        <BoxPlacement box={box} />
      </div>
    </div>
  )
}
