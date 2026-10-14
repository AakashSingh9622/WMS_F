import type { AuditEvent, AuditEventType, Box, Order } from "@/api/types"
import type { HistoricalOrderLink } from "@/mocks/seed/orders"
import { pick, seededInt } from "@/mocks/prng"

export const VISIBLE_TO_CLIENT: Partial<Record<AuditEventType, boolean>> = {
  registered: true,
  added_to_order: true,
  dispatched: true,
  collected: true,
  received: true,
  destruction_authorised: true,
  destroyed: true,
}

const RECIPIENT_NAMES = ["M. Jones", "R. Patel", "K. Ahmed", "L. Chen", "Reception"]

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function generateAuditEvents(
  rng: () => number,
  boxes: Box[],
  orders: Order[],
  historicalOrderByBoxId: Map<string, HistoricalOrderLink>,
): { events: AuditEvent[]; nextSeq: number } {
  const ordersById = new Map(orders.map((o) => [o.id, o]))
  const events: AuditEvent[] = []
  let seq = 1

  function push(box: Box, type: AuditEventType, at: string, fields: Partial<AuditEvent> = {}) {
    events.push({
      id: `audit-${seq++}`,
      boxId: box.id,
      boxNumber: box.boxNumber,
      clientId: box.clientId,
      type,
      at,
      actor: { id: box.createdBy.id, name: box.createdBy.name, side: box.createdBy.side },
      visibleToClient: VISIBLE_TO_CLIENT[type] ?? false,
      ...fields,
    })
  }

  for (const box of boxes) {
    const createdAt = new Date(box.createdAt).toISOString()
    let cursor = createdAt

    push(box, "registered", cursor, { actor: box.createdBy })

    if (box.labelPrinted) {
      cursor = addDays(cursor, 0)
      push(box, "label_printed", cursor, { actor: box.createdBy })
    }

    const isStoredNow = box.status === "stored" || box.status === "reserved"
    if (isStoredNow && box.locationPath) {
      cursor = addDays(cursor, seededInt(rng, 0, 2))
      push(box, "allocated", cursor, { actor: box.createdBy, toLocation: box.locationPath })

      if (rng() < 0.12) {
        cursor = addDays(cursor, seededInt(rng, 5, 200))
        const mover = pick(rng, [box.createdBy, { id: "u-operator", name: "Sara Ali", side: "staff" as const }])
        push(box, "moved", cursor, {
          actor: mover,
          fromLocation: box.locationPath,
          toLocation: box.locationPath,
          note: pick(rng, ["rack maintenance", "consolidating client archive", "capacity rebalance"]),
        })
      }
    }

    if (box.onHold) {
      cursor = addDays(cursor, seededInt(rng, 1, 10))
      push(box, "hold_placed", cursor, { actor: { id: "u-admin", name: "Ahmed Khan", side: "staff" }, note: box.holdReason })
    }

    if (box.status === "reserved" && box.openOrder) {
      const order = ordersById.get(box.openOrder.id)
      cursor = addDays(cursor, seededInt(rng, 1, 30))
      push(box, "added_to_order", cursor, {
        actor: order?.requestedBy ?? box.createdBy,
        orderId: box.openOrder.id,
        orderNumber: box.openOrder.orderNumber,
      })
    }

    const historical = historicalOrderByBoxId.get(box.id)
    if (historical && (box.status === "out" || box.status === "destroyed")) {
      const order = ordersById.get(historical.orderId)
      cursor = addDays(cursor, seededInt(rng, 5, 60))
      push(box, "added_to_order", cursor, {
        actor: order?.requestedBy ?? box.createdBy,
        orderId: historical.orderId,
        orderNumber: historical.orderNumber,
      })

      cursor = addDays(cursor, seededInt(rng, 1, 10))
      push(box, "picked", cursor, { actor: { id: "u-operator", name: "Sara Ali", side: "staff" }, orderId: historical.orderId, orderNumber: historical.orderNumber })

      if (historical.type === "dispatch") {
        cursor = addDays(cursor, 0)
        push(box, "dispatched", cursor, {
          actor: { id: "u-operator", name: "Sara Ali", side: "staff" },
          orderId: historical.orderId,
          orderNumber: historical.orderNumber,
          note: pick(rng, RECIPIENT_NAMES),
        })
      } else if (historical.type === "destruction" && order?.destruction) {
        cursor = addDays(cursor, seededInt(rng, 1, 5))
        push(box, "destruction_authorised", cursor, {
          actor: { id: "u-admin", name: "Ahmed Khan", side: "staff" },
          orderId: historical.orderId,
          orderNumber: historical.orderNumber,
        })
        cursor = addDays(cursor, seededInt(rng, 1, 3))
        push(box, "destroyed", cursor, {
          actor: { id: "u-operator", name: "Sara Ali", side: "staff" },
          orderId: historical.orderId,
          orderNumber: historical.orderNumber,
          note: order.destruction.method,
          changes: order.destruction.witness ? [{ field: "witness", to: order.destruction.witness }] : undefined,
        })
      }
    }
  }

  return { events, nextSeq: seq }
}
