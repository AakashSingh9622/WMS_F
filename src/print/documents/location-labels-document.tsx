"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { useRack, useRackSlots, useWarehouse } from "@/api/warehouses"
import { Barcode } from "@/components/barcode-label"
import { Button } from "@/components/ui/button"
import { shelfCode } from "@/domain/location"

/**
 * Shelf / position labels for one rack (Sprint 10), 100 × 50 mm like the box labels. A position label carries the slot
 * barcode; a shelf label carries the shelf code ("B04-3") — put-away accepts both, and for a shelf picks the position.
 */
export function LocationLabelsDocument() {
  const searchParams = useSearchParams()
  const rackId = searchParams.get("rackId") ?? ""
  const [kind, setKind] = useState<"positions" | "shelves">("positions")
  const { data: rack } = useRack(rackId)
  const { data: slots } = useRackSlots(rackId)
  const { data: warehouse } = useWarehouse(rack?.warehouseId ?? "")

  if (!rackId) {
    return <p className="text-muted-foreground p-8 text-sm">No rack specified — open this from a rack page.</p>
  }
  if (!rack || !slots) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>

  const upper = [
    warehouse?.code,
    rack.zone && `Zone ${rack.zone.code}`,
    rack.aisle && `Aisle ${rack.aisle.code}`,
    `Rack ${rack.code}`,
  ]
    .filter(Boolean)
    .join(" › ")
  const labels =
    kind === "positions"
      ? slots.map((s) => ({
          key: s.id,
          code: shelfCode(rack.code, s.row, s.column),
          where: `${upper} › Shelf ${s.row} · Position ${s.column}`,
          barcode: s.barcode,
        }))
      : Array.from({ length: rack.rows }, (_, i) => i + 1).map((row) => ({
          key: String(row),
          code: shelfCode(rack.code, row),
          where: `${upper} › Shelf ${row}`,
          barcode: shelfCode(rack.code, row),
        }))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 p-4 print:hidden">
        <span className="text-sm font-medium">{rack.label} —</span>
        <Button size="sm" variant={kind === "positions" ? "default" : "outline"} onClick={() => setKind("positions")}>
          Position labels ({slots.length})
        </Button>
        <Button size="sm" variant={kind === "shelves" ? "default" : "outline"} onClick={() => setKind("shelves")}>
          Shelf labels ({rack.rows})
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <div className="flex flex-wrap gap-4 p-4 print:gap-0 print:p-0">
        {labels.map((l) => (
          <div key={l.key} className="print:break-after-page">
            <div className="flex w-[100mm] flex-col items-center gap-1 border border-black bg-white p-3 text-black print:border-0">
              <div className="text-[10px]">{l.where}</div>
              <div className="font-mono text-2xl font-bold">{l.code}</div>
              <Barcode value={l.barcode} className="w-full" />
              <div className="font-mono text-[10px]">{l.barcode}</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @media print {
          @page {
            size: 100mm 50mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  )
}
