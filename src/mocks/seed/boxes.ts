import type { Actor, Box, BoxSize, BoxStatus, Client, Slot } from "@/api/types"
import { pick, seededInt } from "@/mocks/prng"

const DESCRIPTION_TOPICS = [
  "Invoices", "Purchase orders", "HR files", "Client correspondence", "Contracts",
  "Payroll records", "Tax records", "Meeting minutes", "Project files", "Expense reports",
  "Audit records", "Insurance claims", "Bank statements", "Supplier agreements", "Case files",
]
const DEPARTMENTS = ["Finance", "HR", "Legal", "Operations", "Sales"]
const STAFF_ACTORS: Actor[] = [
  { id: "u-admin", name: "Ahmed Khan", side: "staff" },
  { id: "u-operator", name: "Sara Ali", side: "staff" },
  { id: "staff-3", name: "Tom Bell", side: "staff" },
]

// Trimmed down from spec §6's ~1,200-box scale to something easy to click through in a
// demo — every client gets roughly the same small handful of boxes instead of a few
// large clients dominating the count.
function boxCountForClientIndex(rng: () => number): number {
  return seededInt(rng, 16, 24)
}

function formatDate(year: number, month: number, day = 1): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export interface GenerateBoxesResult {
  boxes: Box[]
  /** slotId -> box units placed in it, so the caller can set Slot.used from real boxes. */
  slotUsage: Map<string, number>
  /** Next free numeric suffix for "box-N" ids / "BX..." barcodes, so live-registered boxes don't collide. */
  nextBoxSeq: number
}

export function generateBoxes(rng: () => number, clients: Client[], availableSlots: Slot[]): GenerateBoxesResult {
  const boxes: Box[] = []
  const slotUsage = new Map<string, number>()
  const slotRemaining = new Map<string, number>(availableSlots.map((s) => [s.id, s.capacity]))
  let sequence = 1

  function nextSlotFor(size: BoxSize): Slot | undefined {
    const unitsNeeded = size === "large" ? 2 : 1
    // Prefer partially filled slots first, to leave whole empty slots for future allocation.
    const candidates = availableSlots
      .filter((s) => s.status !== "blocked" && (slotRemaining.get(s.id) ?? 0) >= unitsNeeded)
      .sort((a, b) => (slotRemaining.get(a.id) ?? 0) - (slotRemaining.get(b.id) ?? 0))
    if (candidates.length === 0) return undefined
    return candidates[Math.floor(rng() * Math.min(candidates.length, 8))]
  }

  for (const client of clients) {
    const count = boxCountForClientIndex(rng)

    for (let i = 0; i < count; i++) {
      const barcode = `BX${String(sequence).padStart(8, "0")}`
      const boxNumber = barcode
      sequence++

      const size: BoxSize = rng() < 0.8 ? "standard" : "large"
      const topic = pick(rng, DESCRIPTION_TOPICS)
      const yearFrom = seededInt(rng, 2015, 2024)
      const spanYears = seededInt(rng, 0, 3)
      const yearTo = yearFrom + spanYears
      const description = spanYears > 0 ? `${topic} ${yearFrom}–${yearTo}` : `${topic} ${yearFrom}`

      const statusRoll = rng()
      let status: BoxStatus
      if (statusRoll < 0.1) status = "unallocated"
      else if (statusRoll < 0.72) status = "stored"
      else if (statusRoll < 0.85) status = "out"
      else status = "destroyed"

      const onHold = status === "stored" && rng() < 0.04
      const labelPrinted = status === "unallocated" ? rng() < 0.5 : true

      let slotId: string | undefined
      let locationPath: Box["locationPath"]
      if (status === "stored") {
        const slot = nextSlotFor(size)
        if (slot) {
          slotId = slot.id
          const units = size === "large" ? 2 : 1
          slotRemaining.set(slot.id, (slotRemaining.get(slot.id) ?? 0) - units)
          slotUsage.set(slot.id, (slotUsage.get(slot.id) ?? 0) + units)
          const warehouseCode = slot.warehouseId === "wh-1" ? "WH1" : "WH2"
          locationPath = { warehouse: warehouseCode, rack: slot.id.split("-slot-")[0].split("-rack-")[1], slot: slot.code }
        } else {
          status = "unallocated" // ran out of room — stays consistent with capacity
        }
      }

      const destroyAfter = rng() < 0.3 ? formatDate(yearTo + seededInt(rng, 5, 10), seededInt(rng, 1, 12)) : undefined

      boxes.push({
        id: `box-${sequence - 1}`,
        boxNumber,
        barcode,
        clientId: client.id,
        clientName: client.name,
        description,
        department: rng() < 0.3 ? pick(rng, DEPARTMENTS) : undefined,
        reference: rng() < 0.4 ? `REF-${seededInt(rng, 1000, 9999)}` : undefined,
        filingDateFrom: formatDate(yearFrom, seededInt(rng, 1, 12)),
        filingDateTo: spanYears > 0 ? formatDate(yearTo, seededInt(rng, 1, 12)) : undefined,
        destroyAfter,
        size,
        status,
        onHold,
        holdReason: onHold ? pick(rng, ["Litigation hold", "Client dispute", "Audit in progress"]) : undefined,
        labelPrinted,
        slotId,
        locationPath,
        openOrder: undefined, // linked in seed/orders.ts for a subset of boxes
        createdAt: formatDate(yearFrom, seededInt(rng, 1, 12), seededInt(rng, 1, 28)),
        createdBy: pick(rng, STAFF_ACTORS),
      })
    }
  }

  return { boxes, slotUsage, nextBoxSeq: sequence }
}
