import type { LocationPath } from "@/api/types"

/**
 * Display parts of a stored location (Sprint 10): warehouse › zone › aisle › rack › shelf · position — zone and aisle
 * only when the rack has them. Older snapshots (`{ warehouse, rack, slot: "3-2" }`) never get rewritten in history, so
 * shelf / position are read from the "row-column" slot code when missing. Goods-In is just "WH1 › Goods-In".
 */
export function locationSegments(p: LocationPath): string[] {
  if (p.rack === "Goods-In") return [p.warehouse, "Goods-In"]
  const { shelf, position } = shelfAndPosition(p)
  return [
    p.warehouse,
    ...(p.zone ? [`Zone ${p.zone}`] : []),
    ...(p.aisle ? [`Aisle ${p.aisle}`] : []),
    `Rack ${p.rack}`,
    shelf != null ? `Shelf ${shelf} · Position ${position}` : `Slot ${p.slot}`,
  ]
}

/** Shelf (rack row) and position (column) of a stored location; older snapshots: from the "3-2" slot code. */
export function shelfAndPosition(p: LocationPath): { shelf?: number; position?: number } {
  const [row, column] = /^\d+-\d+$/.test(p.slot) ? p.slot.split("-").map(Number) : []
  return { shelf: p.shelf ?? row, position: p.position ?? column }
}

/** One line of text, e.g. for a toast or a "moved since" note. */
export function locationText(p: LocationPath | undefined | null): string {
  return p ? locationSegments(p).join(" › ") : ""
}

/** The short code people type to find a shelf or position again: "B04-3" / "B04-3-2". */
export function shelfCode(rackCode: string, shelf: number, position?: number): string {
  return position == null ? `${rackCode}-${shelf}` : `${rackCode}-${shelf}-${position}`
}
