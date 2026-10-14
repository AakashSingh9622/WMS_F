import { mulberry32 } from "@/mocks/prng"

export { seedUsers, type SeedUser } from "@/mocks/seed/users"
import { generateLocationSeed } from "@/mocks/seed/locations"
import { generateClients } from "@/mocks/seed/clients"
import { generateBoxes } from "@/mocks/seed/boxes"
import { generateOrders } from "@/mocks/seed/orders"
import { generateAuditEvents } from "@/mocks/seed/audit"
import type { AuditEvent, Box, Client, Order, OrderLine, OrderType, Rack, Slot, Warehouse } from "@/api/types"

const SEED = 20260101

export interface FullSeed {
  warehouses: Warehouse[]
  racks: Rack[]
  slots: Slot[]
  clients: Client[]
  boxes: Box[]
  orders: Order[]
  orderLines: OrderLine[]
  auditEvents: AuditEvent[]
  orderSeq: Record<OrderType, number>
  nextOrderIdSeq: number
  nextAuditIdSeq: number
  nextBoxSeq: number
}

/** Orchestrates every seed generator with one shared PRNG so the whole dataset is reproducible (spec §6). */
export function generateFullSeed(): FullSeed {
  const rng = mulberry32(SEED)

  const { warehouses, racks, slots } = generateLocationSeed(rng)
  const clients = generateClients(rng)
  const { boxes: unlinkedBoxes, slotUsage, nextBoxSeq } = generateBoxes(rng, clients, slots)

  // Real box placement drives slot usage — locations.ts only seeds capacity/blocked shape.
  for (const slot of slots) {
    slot.used = slotUsage.get(slot.id) ?? 0
    if (slot.status !== "blocked") slot.status = slot.used >= slot.capacity ? "full" : "available"
  }
  for (const rack of racks) {
    const rackSlots = slots.filter((s) => s.rackId === rack.id)
    rack.usedCapacity = rackSlots.reduce((sum, s) => sum + s.used, 0)
    rack.totalCapacity = rackSlots.reduce((sum, s) => sum + s.capacity, 0)
  }
  for (const warehouse of warehouses) {
    const whRacks = racks.filter((r) => r.warehouseId === warehouse.id)
    warehouse.usedCapacity = whRacks.reduce((sum, r) => sum + r.usedCapacity, 0)
    warehouse.totalCapacity = whRacks.reduce((sum, r) => sum + r.totalCapacity, 0)
  }

  const { orders, orderLines, boxes, historicalOrderByBoxId, finalOrderSeq, nextOrderIdSeq } = generateOrders(
    rng,
    clients,
    unlinkedBoxes,
  )
  const { events: auditEvents, nextSeq: nextAuditIdSeq } = generateAuditEvents(rng, boxes, orders, historicalOrderByBoxId)

  for (const client of clients) {
    client.boxCount = boxes.filter((b) => b.clientId === client.id).length
    client.openOrderCount = orders.filter(
      (o) => o.clientId === client.id && !["completed", "cancelled", "rejected"].includes(o.status),
    ).length
  }

  return {
    warehouses,
    racks,
    slots,
    clients,
    boxes,
    orders,
    orderLines,
    auditEvents,
    orderSeq: finalOrderSeq,
    nextOrderIdSeq,
    nextAuditIdSeq,
    nextBoxSeq,
  }
}
