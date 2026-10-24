"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"
import { Copy } from "@/components/icons"
import { toast } from "sonner"

import { useBox } from "@/api/boxes"
import { useLegalHolds } from "@/api/records"
import { useCan } from "@/auth/useAuth"
import { BoxActions } from "@/staff/features/boxes/box-actions"
import { PlaceHoldDialog } from "@/staff/features/records/legal-holds-screen"
import { BoxStatusBadge } from "@/components/status-badge"
import { LocationPath } from "@/components/location-path"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export function BoxDetailHeader({ boxId }: { boxId: string }) {
  const { data: box, isLoading } = useBox(boxId)
  const canRecords = useCan("records.manage")
  const { data: holds } = useLegalHolds({ coversBox: boxId })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
    )
  }
  if (!box) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{box.boxNumber}</h1>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(box.barcode)
            toast.success("Barcode copied")
          }}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono text-xs"
        >
          {box.barcode}
          <Copy className="size-3" />
        </button>
        <BoxStatusBadge status={box.status} />
        {box.onHold && (
          <Badge variant="outline" className="border-status-hold text-status-hold">
            On hold — {box.holdReason}
          </Badge>
        )}
        {!box.labelPrinted && (
          <Badge variant="outline" className="text-muted-foreground">
            Label not printed
          </Badge>
        )}
      </div>

      {box.status === "missing" && (
        <div className="bg-status-hold/10 border-status-hold/30 text-status-hold w-fit max-w-full rounded-md border px-3 py-2 text-sm">
          <p className="font-semibold">This box is missing</p>
          <p>
            Reason: {box.missingReason || "not given"}
            {box.missingAt ? " · reported " + formatDate(box.missingAt) : ""}
          </p>
          <p className="text-xs opacity-80">
            It is not in any slot and cannot be put on an order. If it turns up, use “Found — place in a slot”.
          </p>
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link href={`/app/clients/${box.clientId}`} className="hover:text-primary underline-offset-2 hover:underline">
          {box.clientName}
        </Link>
        {box.locationPath ? (
          <LocationPath
            segments={[
              { label: box.locationPath.warehouse },
              { label: `Rack ${box.locationPath.rack}` },
              { label: `Slot ${box.locationPath.slot}` },
            ]}
          />
        ) : (
          <span>{box.status === "missing" ? "Last known location is in the history" : "Not allocated to a slot"}</span>
        )}
      </div>

      {box.openOrder && (
        <Link
          href={`/app/orders/${box.openOrder.id}`}
          className="bg-status-reserved/10 border-status-reserved/30 text-status-reserved block w-fit rounded-md border px-3 py-1.5 text-sm hover:underline"
        >
          On {box.openOrder.type} order {box.openOrder.orderNumber} — {box.openOrder.status}
        </Link>
      )}

      {box.status === "destroyed" && (
        <div className="bg-muted text-muted-foreground w-fit rounded-md px-3 py-1.5 text-sm">
          Destroyed — see the Orders tab for the certificate.
        </div>
      )}

      {!!holds?.items.length && (
        <div className="bg-status-hold/10 border-status-hold/30 text-status-hold w-fit max-w-full rounded-md border px-3 py-2 text-sm">
          <p className="font-semibold">Under legal hold — this box can&apos;t be destroyed</p>
          {holds.items.map((h) => (
            <p key={h.id}>
              {h.authority}: {h.reason}
              {h.scope === "client"
                ? " (all of the client's boxes)"
                : h.scope === "category"
                  ? ` (category ${h.category})`
                  : ""}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <BoxActions box={box} />
        {canRecords && box.status !== "destroyed" && (
          <PlaceHoldDialog box={{ id: box.id, boxNumber: box.boxNumber }} label="Legal hold" />
        )}
      </div>
    </div>
  )
}
