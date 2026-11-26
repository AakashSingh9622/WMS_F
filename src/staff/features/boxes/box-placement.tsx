"use client"

import Link from "next/link"
import { useState } from "react"

import { useRack, useRackSlots } from "@/api/warehouses"
import type { Box } from "@/api/types"
import { StoredLocation } from "@/components/location-path"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { rackShelves, type LengthUnit } from "@/domain/dimensions"
import { shelfCode } from "@/domain/location"
import { RackElevation } from "@/staff/features/warehouses/rack-elevation"
import { cn } from "@/lib/utils"

/**
 * "Where it is": the box's place in the warehouse — its full location, the code staff type to find it, and a front view
 * of its module with the box's position marked. Boxes not on a shelf (Goods-In, out, destroyed …) get a line instead.
 */
export function BoxPlacement({ box }: { box: Box }) {
  const rackId = box.slotId ? (box.rackId ?? "") : ""
  const { data: rack, isLoading: loadingRack } = useRack(rackId)
  const { data: slots, isLoading: loadingSlots } = useRackSlots(rackId)
  const [unit, setUnit] = useState<LengthUnit>("cm")

  if (!box.slotId) {
    const inGoodsIn = box.locationPath?.rack === "Goods-In"
    return (
      <Card>
        <CardContent className="text-muted-foreground pt-6 text-sm">
          {inGoodsIn
            ? `Not on a shelf yet — waiting in Goods-In at ${box.locationPath?.warehouse}.`
            : "Not on a shelf, so there is nothing to show in the warehouse."}
        </CardContent>
      </Card>
    )
  }
  if (!box.rackId) return null // older backend: no module to draw

  const slot = slots?.find((s) => s.id === box.slotId)
  const rows = rack
    ? rackShelves(rack).map((s) => ({ row: s.row, slots: (slots ?? []).filter((x) => x.row === s.row) }))
    : []

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold">Where it is</h3>
            {box.locationPath && <StoredLocation path={box.locationPath} className="text-sm" />}
            {rack && slot && (
              <p className="text-muted-foreground text-xs">
                Type <span className="text-foreground font-mono">{shelfCode(rack.code, slot.row, slot.column)}</span> to find
                this position — shelf {slot.row} of {rack.rows} (counted from the floor), position {slot.column} of{" "}
                {rack.columns} (from the left).
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Units in the drawing" className="bg-muted inline-flex rounded-lg p-0.5 text-xs">
              {(["cm", "ft"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "focus-visible:ring-ring rounded-md px-2.5 py-1 font-medium outline-none focus-visible:ring-2",
                    unit === u ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
            {rack && box.slotWarehouseId && (
              <Link
                href={`/app/warehouses/${box.slotWarehouseId}/racks/${rack.id}`}
                className="text-primary text-xs underline-offset-2 hover:underline"
              >
                Open module
              </Link>
            )}
          </div>
        </div>

        {loadingRack || loadingSlots ? (
          <Skeleton className="h-72 w-full" />
        ) : rack ? (
          <div className="flex justify-center">
            <RackElevation
              shelves={rackShelves(rack)}
              columns={rack.columns}
              rows={rows}
              unit={unit}
              highlightSlotId={box.slotId}
              highlightLabel="This box"
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">The module of this position couldn&apos;t be loaded.</p>
        )}
      </CardContent>
    </Card>
  )
}
