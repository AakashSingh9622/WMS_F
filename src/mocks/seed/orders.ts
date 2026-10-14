import type {
  Actor,
  Box,
  Client,
  DestructionMethod,
  Order,
  OrderLine,
  OrderLineStatus,
  OrderStatus,
  OrderType,
} from "@/api/types"
import { pick, seededInt } from "@/mocks/prng"

const STAFF_ACTORS: Actor[] = [
  { id: "u-admin", name: "Ahmed Khan", side: "staff" },
  { id: "u-operator", name: "Sara Ali", side: "staff" },
]
const DESTRUCTION_METHODS: DestructionMethod[] = ["shred", "pulp", "incinerate"]

export function orderNumber(type: OrderType, seq: number): string {
  const prefix = type === "collection" ? "COL" : type === "dispatch" ? "DSP" : "DST"
  return `${prefix}-${String(seq).padStart(6, "0")}`
}

function isoDate(daysFromToday: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  return d.toISOString().slice(0, 10)
}

function clientActor(client: Client, rng: () => number): Actor {
  return { id: `${client.id}-user`, name: pick(rng, ["John Smith", "Priya Patel", "Alex Morgan"]), side: "client" }
}

export interface HistoricalOrderLink {
  orderId: string
  orderNumber: string
  type: OrderType
}

export interface GenerateOrdersResult {
  orders: Order[]
  orderLines: OrderLine[]
  boxes: Box[] // mutated: reserved boxes get openOrder set
  /** boxId -> the (now-completed) order that dispatched/destroyed it — used to build audit history. */
  historicalOrderByBoxId: Map<string, HistoricalOrderLink>
  /** Final per-type sequence numbers, so live-created orders keep numbering past the seed. */
  finalOrderSeq: Record<OrderType, number>
  /** Next free numeric suffix for "order-N" ids. */
  nextOrderIdSeq: number
}

export function generateOrders(rng: () => number, clients: Client[], allBoxes: Box[]): GenerateOrdersResult {
  const orders: Order[] = []
  const orderLines: OrderLine[] = []
  const boxes = allBoxes.map((b) => ({ ...b }))
  const boxesByClient = new Map<string, Box[]>()
  for (const box of boxes) {
    if (!boxesByClient.has(box.clientId)) boxesByClient.set(box.clientId, [])
    boxesByClient.get(box.clientId)!.push(box)
  }

  const seq = { collection: 100, dispatch: 100, destruction: 100, digitize: 100 }
  let orderId = 1
  const historicalOrderByBoxId = new Map<string, HistoricalOrderLink>()

  function pushOrder(input: Omit<Order, "id" | "orderNumber" | "boxCount" | "lineSummary">, lines: OrderLine[]) {
    const id = `order-${orderId++}`
    seq[input.type]++
    const lineSummary = lines.reduce<Record<OrderLineStatus, number>>(
      (acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }),
      {} as Record<OrderLineStatus, number>,
    )
    const order: Order = {
      ...input,
      id,
      orderNumber: orderNumber(input.type, seq[input.type]),
      boxCount: lines.length,
      lineSummary,
    }
    orders.push(order)
    for (const line of lines) orderLines.push({ ...line, orderId: id, id: `${id}-line-${line.boxId ?? line.id}` })
    return order
  }

  // Dispatch: pick a handful of `stored` boxes per client into an OPEN order (boxes -> reserved).
  for (const client of clients) {
    const clientBoxes = boxesByClient.get(client.id) ?? []
    const storedBoxes = clientBoxes.filter((b) => b.status === "stored" && !b.onHold)
    if (storedBoxes.length < 4 || rng() > 0.4) continue

    const pickedBoxes = storedBoxes.slice(0, seededInt(rng, 3, Math.min(10, storedBoxes.length)))
    const status: OrderStatus = pick(rng, ["approved", "scheduled", "in_progress"] as const)
    const requestedVia = rng() < 0.3 ? "portal" : "staff"

    const order = pushOrder(
      {
        type: "dispatch",
        status,
        clientId: client.id,
        clientName: client.name,
        requestedBy: requestedVia === "portal" ? clientActor(client, rng) : pick(rng, STAFF_ACTORS),
        requestedVia,
        createdAt: isoDate(-seededInt(rng, 1, 20)),
        scheduledFor: isoDate(seededInt(rng, -2, 10)),
        contactName: pick(rng, ["Reception", "Facilities", "John Smith"]),
      },
      pickedBoxes.map((b) => ({
        id: b.id,
        orderId: "",
        boxId: b.id,
        boxNumber: b.boxNumber,
        status: "pending" as OrderLineStatus,
        fromLocation: b.locationPath,
      })),
    )

    for (const b of pickedBoxes) {
      b.status = "reserved"
      b.openOrder = { id: order.id, orderNumber: order.orderNumber, type: "dispatch", status: order.status }
    }
  }

  // Dispatch: group already-`out` boxes per client into a retroactive COMPLETED order.
  for (const client of clients) {
    const outBoxes = (boxesByClient.get(client.id) ?? []).filter((b) => b.status === "out")
    if (outBoxes.length === 0) continue
    for (let i = 0; i < outBoxes.length; i += 8) {
      const group = outBoxes.slice(i, i + 8)
      if (group.length === 0) continue
      const order = pushOrder(
        {
          type: "dispatch",
          status: "completed",
          clientId: client.id,
          clientName: client.name,
          requestedBy: pick(rng, STAFF_ACTORS),
          requestedVia: "staff",
          createdAt: isoDate(-seededInt(rng, 30, 300)),
          completedAt: isoDate(-seededInt(rng, 20, 290)),
          contactName: "Reception",
        },
        group.map((b) => ({
          id: b.id,
          orderId: "",
          boxId: b.id,
          boxNumber: b.boxNumber,
          status: "dispatched" as OrderLineStatus,
          fromLocation: undefined,
        })),
      )
      for (const b of group) {
        historicalOrderByBoxId.set(b.id, { orderId: order.id, orderNumber: order.orderNumber, type: "dispatch" })
      }
    }
  }

  // Destruction: group `destroyed` boxes per client into a retroactive COMPLETED order with a certificate.
  for (const client of clients) {
    const destroyedBoxes = (boxesByClient.get(client.id) ?? []).filter((b) => b.status === "destroyed")
    if (destroyedBoxes.length === 0) continue
    for (let i = 0; i < destroyedBoxes.length; i += 6) {
      const group = destroyedBoxes.slice(i, i + 6)
      if (group.length === 0) continue
      const authorisedAt = isoDate(-seededInt(rng, 40, 320))
      const order = pushOrder(
        {
          type: "destruction",
          status: "completed",
          clientId: client.id,
          clientName: client.name,
          requestedBy: pick(rng, STAFF_ACTORS),
          requestedVia: "staff",
          createdAt: authorisedAt,
          completedAt: isoDate(-seededInt(rng, 20, 39)),
          destruction: {
            method: pick(rng, DESTRUCTION_METHODS),
            authorisedBy: pick(rng, ["John Smith", "Offline authorisation ref #4471"]),
            authorisedAt,
            witness: rng() < 0.5 ? pick(rng, STAFF_ACTORS).name : undefined,
          },
        },
        group.map((b) => ({
          id: b.id,
          orderId: "",
          boxId: b.id,
          boxNumber: b.boxNumber,
          status: "destroyed" as OrderLineStatus,
          fromLocation: undefined,
        })),
      )
      for (const b of group) {
        historicalOrderByBoxId.set(b.id, { orderId: order.id, orderNumber: order.orderNumber, type: "destruction" })
      }
    }
  }

  // Collection: a handful of standalone requests (new boxes and/or returning `out` boxes), varied statuses.
  const collectionStatuses: OrderStatus[] = ["requested", "approved", "scheduled", "completed", "rejected", "cancelled"]
  for (let i = 0; i < 8; i++) {
    const client = pick(rng, clients)
    const status = pick(rng, collectionStatuses)
    const requestedVia = rng() < 0.5 ? "portal" : "staff"
    const outBoxes = (boxesByClient.get(client.id) ?? []).filter((b) => b.status === "out")
    const returning = outBoxes.length > 0 && rng() < 0.4 ? outBoxes.slice(0, seededInt(rng, 1, Math.min(4, outBoxes.length))) : []

    pushOrder(
      {
        type: "collection",
        status,
        clientId: client.id,
        clientName: client.name,
        requestedBy: requestedVia === "portal" ? clientActor(client, rng) : pick(rng, STAFF_ACTORS),
        requestedVia,
        createdAt: isoDate(-seededInt(rng, 1, 60)),
        scheduledFor: status === "requested" ? undefined : isoDate(seededInt(rng, -5, 15)),
        completedAt: status === "completed" ? isoDate(-seededInt(rng, 1, 5)) : undefined,
        address: `${seededInt(rng, 1, 99)} Warehouse Ave`,
        contactName: "Reception",
        collection: { expectedNewBoxes: seededInt(rng, 0, 20) },
      },
      returning.map((b) => ({
        id: b.id,
        orderId: "",
        boxId: b.id,
        boxNumber: b.boxNumber,
        status: (status === "completed" ? "received" : "pending") as OrderLineStatus,
      })),
    )
  }

  return { orders, orderLines, boxes, historicalOrderByBoxId, finalOrderSeq: seq, nextOrderIdSeq: orderId }
}
