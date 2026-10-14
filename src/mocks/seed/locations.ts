import type { Rack, Slot, SlotStatus, Warehouse } from "@/api/types"
import { mulberry32 } from "@/mocks/prng"

const SEED = 42
const SLOT_CAPACITY = 10
const ROWS = 4
const COLUMNS = 6
const RACK_LETTERS = "ABCDEFGHIJ"

interface WarehouseSeedSpec {
  id: string
  code: string
  name: string
  address: string
  rackCount: number
}

const WAREHOUSE_SPECS: WarehouseSeedSpec[] = [
  { id: "wh-1", code: "WH1", name: "Central Warehouse", address: "12 Dockside Road, London E1 8QS", rackCount: 8 },
  { id: "wh-2", code: "WH2", name: "North Warehouse", address: "4 Bridgewater Way, Manchester M4 5JB", rackCount: 6 },
]

export interface LocationSeed {
  warehouses: Warehouse[]
  racks: Rack[]
  slots: Slot[]
}

function rackCode(index: number): string {
  const letter = RACK_LETTERS[index % RACK_LETTERS.length]
  const number = Math.floor(index / RACK_LETTERS.length) + 1
  return `${letter}${String(number).padStart(2, "0")}`
}

export function generateLocationSeed(rng: () => number = mulberry32(SEED)): LocationSeed {
  const warehouses: Warehouse[] = []
  const racks: Rack[] = []
  const slots: Slot[] = []

  for (const wh of WAREHOUSE_SPECS) {
    let warehouseTotal = 0

    for (let r = 0; r < wh.rackCount; r++) {
      const code = rackCode(r)
      const rackId = `${wh.id}-rack-${code}`
      let rackTotal = 0

      for (let row = 1; row <= ROWS; row++) {
        for (let col = 1; col <= COLUMNS; col++) {
          const isBlocked = rng() < 0.04
          const capacity = SLOT_CAPACITY
          // used starts at 0 — real boxes (seed/boxes.ts) fill slots and the caller
          // (seed/index.ts) applies the resulting used/status back onto these slots.
          const status: SlotStatus = isBlocked ? "blocked" : "available"

          slots.push({
            id: `${rackId}-slot-${row}-${col}`,
            rackId,
            warehouseId: wh.id,
            code: `${row}-${col}`,
            barcode: `SL-${wh.code}-${code}-${row}-${col}`,
            row,
            column: col,
            capacity,
            used: 0,
            status,
          })

          rackTotal += capacity
        }
      }

      racks.push({
        id: rackId,
        warehouseId: wh.id,
        code,
        label: `Rack ${code[0]}-${code.slice(1)}`,
        rows: ROWS,
        columns: COLUMNS,
        cellLengthCm: SLOT_CAPACITY, // legacy mock data (unused by the real backend) — treated as cm
        usedCapacity: 0,
        totalCapacity: rackTotal,
      })

      warehouseTotal += rackTotal
    }

    warehouses.push({
      id: wh.id,
      code: wh.code,
      name: wh.name,
      address: wh.address,
      rackCount: wh.rackCount,
      slotCount: wh.rackCount * ROWS * COLUMNS,
      usedCapacity: 0,
      totalCapacity: warehouseTotal,
    })
  }

  return { warehouses, racks, slots }
}
