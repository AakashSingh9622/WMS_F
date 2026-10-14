import type { Box, BoxSize, LocationPath, Rack, Slot, SlotSuggestion } from "@/api/types"

export interface SlotSuggestionInput {
  clientId: string
  boxSizes: BoxSize[]
  warehouseId?: string
  preferSlotIds?: string[]
}

export interface SlotSuggestionContext {
  slots: Slot[]
  racks: Rack[]
  boxes: Box[]
}

function unitsFor(sizes: BoxSize[]): number {
  return sizes.reduce((sum, size) => sum + (size === "large" ? 2 : 1), 0)
}

function warehouseCode(warehouseId: string): string {
  return warehouseId === "wh-1" ? "WH1" : "WH2"
}

function locationPathForSlot(slot: Slot, racks: Rack[]): LocationPath {
  const rack = racks.find((r) => r.id === slot.rackId)
  const rackLabel = rack ? `${rack.code[0]}-${rack.code.slice(1)}` : slot.rackId
  return { warehouse: warehouseCode(slot.warehouseId), rack: rackLabel, slot: slot.code }
}

/**
 * Mock implementation of spec §6's slot suggestion — the real one belongs on the backend.
 * Scores every eligible slot and returns the top 5 with plain-language reasons.
 */
export function suggestSlots(input: SlotSuggestionInput, context: SlotSuggestionContext): SlotSuggestion[] {
  const totalUnits = unitsFor(input.boxSizes)
  if (totalUnits <= 0) return []

  const eligible = context.slots.filter(
    (s) =>
      s.status !== "blocked" &&
      s.capacity - s.used >= totalUnits &&
      (!input.warehouseId || s.warehouseId === input.warehouseId),
  )

  const clientBoxCountByRack = new Map<string, number>()
  for (const box of context.boxes) {
    if (box.clientId !== input.clientId || !box.slotId) continue
    const slot = context.slots.find((s) => s.id === box.slotId)
    if (slot) clientBoxCountByRack.set(slot.rackId, (clientBoxCountByRack.get(slot.rackId) ?? 0) + 1)
  }

  const scored = eligible.map((slot) => {
    let score = 0
    const reasons: string[] = []
    const free = slot.capacity - slot.used

    if (input.preferSlotIds?.includes(slot.id)) {
      score += 100
      reasons.push("Previous slot for this box")
    }

    const clientCount = clientBoxCountByRack.get(slot.rackId) ?? 0
    if (clientCount > 0) {
      score += 20
      reasons.push(`Same rack as ${clientCount} other box${clientCount === 1 ? "" : "es"} from this client`)
    }

    const wasted = free - totalUnits
    if (wasted === 0) {
      score += 30
      reasons.push("Fills slot to 100%")
    } else {
      score += Math.max(0, 15 - wasted)
      if (slot.used > 0) reasons.push(`Partially filled (${slot.used}/${slot.capacity} used) — reduces fragmentation`)
    }

    if (reasons.length === 0) reasons.push("Has enough free space")

    return { slot, score, reasons, free }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, 5).map(({ slot, score, reasons, free }) => ({
    slotId: slot.id,
    locationPath: locationPathForSlot(slot, context.racks),
    freeCapacity: free - totalUnits,
    score,
    reasons,
  }))
}

export { locationPathForSlot, warehouseCode }
