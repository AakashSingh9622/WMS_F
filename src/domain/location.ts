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
    ...(p.zone ? [`Floor ${p.zone}`] : []),
    ...(p.aisle ? [`Aisle ${p.aisle}`] : []),
    `Module ${p.rack}`,
    shelf != null ? `Shelf ${shelf} · Position ${position}` : `Slot ${p.slot}`,
  ]
}

/**
 * The same parts as `locationSegments`, each with a link to Find a box filtered to that place (everything in that
 * warehouse / floor / aisle / module / shelf). The position has no link; Goods-In links to its warehouse.
 */
export function locationSegmentLinks(p: LocationPath): { label: string; href?: string }[] {
  const labels = locationSegments(p)
  const find = (filters: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) sp.set(key, value)
    return `/app/boxes?${sp.toString()}`
  }
  if (p.rack === "Goods-In") return [{ label: labels[0], href: find({ wh: p.warehouse }) }, { label: labels[1] }]
  const { shelf } = shelfAndPosition(p)
  let i = 0
  const out: { label: string; href?: string }[] = [{ label: labels[i++], href: find({ wh: p.warehouse }) }]
  if (p.zone) out.push({ label: labels[i++], href: find({ wh: p.warehouse, zone: p.zone }) })
  if (p.aisle) out.push({ label: labels[i++], href: find({ wh: p.warehouse, zone: p.zone, aisle: p.aisle }) })
  out.push({ label: labels[i++], href: find({ module: p.rack }) })
  out.push({ label: labels[i++], href: shelf != null ? find({ module: p.rack, shelf: String(shelf) }) : undefined })
  return out
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
/**
 * "Aisle 01" for an aisle whose code is "<floor>-<aisle>" (what Import layout makes, e.g. 00-01 on floor 00), so the
 * heading reads like the client's sheet. Any other aisle is "Aisle <code>". `code` is the full code, for a hint beside it.
 */
export function aisleTitle(aisle: { code: string }, zone?: { code: string } | null): { title: string; code?: string } {
  const prefix = zone ? `${zone.code}-` : ""
  if (prefix && aisle.code.length > prefix.length && aisle.code.toLowerCase().startsWith(prefix.toLowerCase())) {
    return { title: `Aisle ${aisle.code.slice(prefix.length)}`, code: aisle.code }
  }
  return { title: `Aisle ${aisle.code}` }
}

export function shelfCode(rackCode: string, shelf: number, position?: number): string {
  return position == null ? `${rackCode}-${shelf}` : `${rackCode}-${shelf}-${position}`
}
