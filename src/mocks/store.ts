import type {
  Actor,
  AuditEvent,
  AuditEventType,
  Box,
  BoxSize,
  BoxStatus,
  Client,
  DestructionMethod,
  Order,
  OrderLine,
  OrderLineStatus,
  OrderStatus,
  OrderType,
  Rack,
  Slot,
  SlotSuggestion,
  Warehouse,
} from "@/api/types"
import { generateFullSeed } from "@/mocks/seed"
import { orderNumber } from "@/mocks/seed/orders"
import { VISIBLE_TO_CLIENT } from "@/mocks/seed/audit"
import { assertTransition } from "@/mocks/orderMachine"
import { getBoxIneligibilityReason } from "@/domain/orders"
import { suggestSlots as suggestSlotsLogic } from "@/domain/slotSuggestion"

// Bump when the seed shape/generation logic changes, so stale localStorage
// data (spec §6: "persist mock state to localStorage") gets regenerated
// instead of silently mismatching the current types.
const SEED_VERSION = 5
const STORAGE_KEY = "wms-mock-store"

interface MockState {
  version: number
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

let state: MockState | null = null

function freshState(): MockState {
  return { version: SEED_VERSION, ...generateFullSeed() }
}

function load(): MockState {
  if (state) return state
  if (typeof localStorage === "undefined") {
    state = freshState()
    return state
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockState
      if (parsed.version === SEED_VERSION) {
        state = parsed
        return state
      }
    }
  } catch {
    // fall through to a fresh seed
  }
  state = freshState()
  persist()
  return state
}

function persist() {
  if (!state || typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full/unavailable — mock state just won't survive a refresh
  }
}

export function getStore(): MockState {
  return load()
}

export function resetStore(): MockState {
  state = freshState()
  persist()
  return state
}

// --- Locations ---------------------------------------------------------------

function recomputeRack(store: MockState, rackId: string) {
  const rack = store.racks.find((r) => r.id === rackId)
  if (!rack) return
  const rackSlots = store.slots.filter((s) => s.rackId === rackId)
  rack.usedCapacity = rackSlots.reduce((sum, s) => sum + s.used, 0)
  rack.totalCapacity = rackSlots.reduce((sum, s) => sum + s.capacity, 0)
}

function recomputeWarehouse(store: MockState, warehouseId: string) {
  const warehouse = store.warehouses.find((w) => w.id === warehouseId)
  if (!warehouse) return
  const warehouseRacks = store.racks.filter((r) => r.warehouseId === warehouseId)
  warehouse.usedCapacity = warehouseRacks.reduce((sum, r) => sum + r.usedCapacity, 0)
  warehouse.totalCapacity = warehouseRacks.reduce((sum, r) => sum + r.totalCapacity, 0)
}

export function updateSlot(slotId: string, patch: Partial<Pick<Slot, "status" | "capacity">>): Slot {
  const store = load()
  const slot = store.slots.find((s) => s.id === slotId)
  if (!slot) throw new Error(`Slot ${slotId} not found`)

  Object.assign(slot, patch)
  if (patch.status === "blocked") slot.used = 0
  if (slot.status !== "blocked") {
    slot.status = slot.used >= slot.capacity ? "full" : "available"
  }

  recomputeRack(store, slot.rackId)
  recomputeWarehouse(store, slot.warehouseId)
  persist()
  return slot
}

/** Frees a box's slot capacity (dispatch/destroy) without touching the box itself. */
function releaseBoxSlot(store: MockState, box: Box) {
  if (!box.slotId) return
  const slot = store.slots.find((s) => s.id === box.slotId)
  if (!slot) return
  const units = box.size === "large" ? 2 : 1
  slot.used = Math.max(0, slot.used - units)
  if (slot.status !== "blocked") slot.status = slot.used >= slot.capacity ? "full" : "available"
  recomputeRack(store, slot.rackId)
  recomputeWarehouse(store, slot.warehouseId)
  box.slotId = undefined
  box.locationPath = undefined
}

// --- Boxes ---------------------------------------------------------------------

export interface BoxSearchParams {
  q?: string
  clientId?: string
  status?: BoxStatus[]
  onHold?: boolean
  warehouseId?: string
  orderId?: string
  page?: number
  pageSize?: number
}

export function searchBoxes(params: BoxSearchParams): { items: Box[]; total: number } {
  const store = load()
  let items = store.boxes

  if (params.q) {
    const q = params.q.toLowerCase()
    items = items.filter(
      (b) =>
        b.boxNumber.toLowerCase().includes(q) ||
        b.barcode.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.clientName.toLowerCase().includes(q) ||
        (b.reference?.toLowerCase().includes(q) ?? false) ||
        (b.department?.toLowerCase().includes(q) ?? false),
    )
  }
  if (params.clientId) items = items.filter((b) => b.clientId === params.clientId)
  if (params.status?.length) items = items.filter((b) => params.status!.includes(b.status))
  else items = items.filter((b) => b.status !== "destroyed") // default: exclude destroyed (spec §7)
  if (params.onHold !== undefined) items = items.filter((b) => b.onHold === params.onHold)
  if (params.warehouseId) items = items.filter((b) => b.slotId?.startsWith(params.warehouseId!))
  if (params.orderId) items = items.filter((b) => b.openOrder?.id === params.orderId)

  const total = items.length
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

export function getBoxById(id: string): Box | undefined {
  return load().boxes.find((b) => b.id === id)
}

export function getBoxByBarcode(barcode: string): Box | undefined {
  return load().boxes.find((b) => b.barcode === barcode)
}

// --- Clients ---------------------------------------------------------------------

export function getClients(q?: string): Client[] {
  const store = load()
  if (!q) return store.clients
  const needle = q.toLowerCase()
  return store.clients.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      c.code.toLowerCase().includes(needle) ||
      c.attributes.some((a) => a.value.toLowerCase().includes(needle)),
  )
}

export function getClientById(id: string): Client | undefined {
  return load().clients.find((c) => c.id === id)
}

// --- Orders ---------------------------------------------------------------------

export interface OrderSearchParams {
  type?: OrderType
  status?: OrderStatus[]
  clientId?: string
  q?: string
}

export function searchOrders(params: OrderSearchParams): Order[] {
  const store = load()
  let items = store.orders
  if (params.type) items = items.filter((o) => o.type === params.type)
  if (params.status?.length) items = items.filter((o) => params.status!.includes(o.status))
  if (params.clientId) items = items.filter((o) => o.clientId === params.clientId)
  if (params.q) {
    const q = params.q.toLowerCase()
    items = items.filter((o) => o.orderNumber.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q))
  }
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getOrderById(id: string): Order | undefined {
  return load().orders.find((o) => o.id === id)
}

export function getOrderLines(orderId: string): OrderLine[] {
  return load().orderLines.filter((l) => l.orderId === orderId)
}

export function getOrdersForBox(boxId: string): Order[] {
  const store = load()
  const orderIds = new Set(store.orderLines.filter((l) => l.boxId === boxId).map((l) => l.orderId))
  return store.orders.filter((o) => orderIds.has(o.id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// --- Audit -----------------------------------------------------------------------

export interface AuditSearchParams {
  boxId?: string
  clientId?: string
  orderId?: string
  type?: AuditEventType
  visibleToClientOnly?: boolean
  page?: number
  pageSize?: number
}

export function searchAuditEvents(params: AuditSearchParams): { items: AuditEvent[]; total: number } {
  const store = load()
  let items = store.auditEvents
  if (params.boxId) items = items.filter((e) => e.boxId === params.boxId)
  if (params.clientId) items = items.filter((e) => e.clientId === params.clientId)
  if (params.orderId) items = items.filter((e) => e.orderId === params.orderId)
  if (params.type) items = items.filter((e) => e.type === params.type)
  if (params.visibleToClientOnly) items = items.filter((e) => e.visibleToClient)

  items = [...items].sort((a, b) => (a.at < b.at ? 1 : -1))
  const total = items.length
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

// --- Order lifecycle (spec §4) ----------------------------------------------------

function getOrderOrThrow(store: MockState, orderId: string): Order {
  const order = store.orders.find((o) => o.id === orderId)
  if (!order) throw new Error("Order not found")
  return order
}

function appendAuditEvent(
  store: MockState,
  box: Box,
  type: AuditEventType,
  actor: Actor,
  extra: Partial<Pick<AuditEvent, "orderId" | "orderNumber" | "fromLocation" | "toLocation" | "changes" | "note">> = {},
): AuditEvent {
  const event: AuditEvent = {
    id: `audit-${store.nextAuditIdSeq++}`,
    boxId: box.id,
    boxNumber: box.boxNumber,
    clientId: box.clientId,
    type,
    at: new Date().toISOString(),
    actor,
    visibleToClient: VISIBLE_TO_CLIENT[type] ?? false,
    ...extra,
  }
  store.auditEvents.push(event)
  return event
}

function recomputeLineSummary(store: MockState, order: Order) {
  const lines = store.orderLines.filter((l) => l.orderId === order.id)
  order.lineSummary = lines.reduce<Record<OrderLineStatus, number>>(
    (acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }),
    {} as Record<OrderLineStatus, number>,
  )
}

function setOrderStatus(store: MockState, order: Order, status: OrderStatus) {
  assertTransition(order.status, status)
  order.status = status
  if (status === "completed") order.completedAt = new Date().toISOString().slice(0, 10)
  // Box.openOrder is a status snapshot — keep it in sync with the order it points at.
  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) {
    if (!line.boxId) continue
    const box = store.boxes.find((b) => b.id === line.boxId)
    if (box?.openOrder?.id === order.id) box.openOrder = { ...box.openOrder, status }
  }
}

function refreshClientOpenOrderCount(store: MockState, clientId: string) {
  const client = store.clients.find((c) => c.id === clientId)
  if (!client) return
  client.openOrderCount = store.orders.filter(
    (o) => o.clientId === clientId && !["completed", "cancelled", "rejected"].includes(o.status),
  ).length
}

/** Reverts any still-`reserved` box on this order back to `stored` (reject/cancel — spec §4). */
function releaseOrderBoxes(store: MockState, order: Order, actor: Actor) {
  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) {
    if (!line.boxId) continue
    const box = store.boxes.find((b) => b.id === line.boxId)
    if (box && box.status === "reserved" && box.openOrder?.id === order.id) {
      box.status = "stored"
      box.openOrder = undefined
      line.status = "removed"
      appendAuditEvent(store, box, "removed_from_order", actor, { orderId: order.id, orderNumber: order.orderNumber })
    }
  }
  recomputeLineSummary(store, order)
}

export interface CreateOrderInput {
  type: OrderType
  clientId: string
  requestedBy: Actor
  requestedVia: "staff" | "portal"
  boxIds?: string[]
  expectedNewBoxes?: number
  address?: string
  contactName?: string
  contactPhone?: string
  scheduledFor?: string
  notes?: string
}

/** Creates an order + lines; staff-created orders start `approved`, portal ones `requested` (spec §4). */
export function createOrder(input: CreateOrderInput): Order {
  const store = load()
  const client = store.clients.find((c) => c.id === input.clientId)
  if (!client) throw new Error("Client not found")

  const boxes = (input.boxIds ?? []).map((boxId) => {
    const box = store.boxes.find((b) => b.id === boxId)
    if (!box) throw new Error(`Box ${boxId} not found`)
    const reason = getBoxIneligibilityReason(box, input.type)
    if (reason) throw new Error(`${box.boxNumber}: ${reason}`)
    return box
  })

  const status: OrderStatus = input.requestedVia === "portal" ? "requested" : "billing"
  const id = `order-${store.nextOrderIdSeq++}`
  store.orderSeq[input.type]++
  const number = orderNumber(input.type, store.orderSeq[input.type])

  const lines: OrderLine[] = boxes.map((box) => ({
    id: `${id}-line-${box.id}`,
    orderId: id,
    boxId: box.id,
    boxNumber: box.boxNumber,
    status: "pending" as OrderLineStatus,
    fromLocation: box.locationPath,
  }))

  const order: Order = {
    id,
    orderNumber: number,
    type: input.type,
    status,
    clientId: client.id,
    clientName: client.name,
    requestedBy: input.requestedBy,
    requestedVia: input.requestedVia,
    createdAt: new Date().toISOString().slice(0, 10),
    scheduledFor: input.scheduledFor,
    address: input.address,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    notes: input.notes,
    boxCount: lines.length,
    lineSummary: lines.reduce<Record<OrderLineStatus, number>>(
      (acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }),
      {} as Record<OrderLineStatus, number>,
    ),
    collection: input.type === "collection" ? { expectedNewBoxes: input.expectedNewBoxes ?? 0 } : undefined,
  }

  store.orders.push(order)
  store.orderLines.push(...lines)

  if (input.type !== "collection") {
    for (const box of boxes) {
      box.status = "reserved"
      box.openOrder = { id: order.id, orderNumber: order.orderNumber, type: order.type, status: order.status }
      appendAuditEvent(store, box, "added_to_order", input.requestedBy, {
        orderId: order.id,
        orderNumber: order.orderNumber,
      })
    }
  }

  refreshClientOpenOrderCount(store, client.id)
  persist()
  return order
}

export function approveOrder(orderId: string): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  setOrderStatus(store, order, "billing")
  persist()
  return order
}

export function rejectOrder(orderId: string, reason: string, actor: Actor): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  setOrderStatus(store, order, "rejected")
  order.notes = order.notes ? `${order.notes}\nRejected: ${reason}` : `Rejected: ${reason}`
  releaseOrderBoxes(store, order, actor)
  refreshClientOpenOrderCount(store, order.clientId)
  persist()
  return order
}

export function scheduleOrder(orderId: string, scheduledFor: string): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  setOrderStatus(store, order, "scheduled")
  order.scheduledFor = scheduledFor
  persist()
  return order
}

export function startOrder(orderId: string): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  setOrderStatus(store, order, "in_progress")
  persist()
  return order
}

export function cancelOrder(orderId: string, reason: string, actor: Actor): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  setOrderStatus(store, order, "cancelled")
  order.notes = order.notes ? `${order.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}`
  releaseOrderBoxes(store, order, actor)
  refreshClientOpenOrderCount(store, order.clientId)
  persist()
  return order
}

export function dispatchOrder(orderId: string, recipientName: string, actor: Actor): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  if (order.type !== "dispatch") throw new Error("Not a dispatch order")

  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) {
    if (!line.boxId) continue
    const box = store.boxes.find((b) => b.id === line.boxId)
    if (!box) continue
    releaseBoxSlot(store, box)
    box.status = "out"
    box.openOrder = undefined
    line.status = "dispatched"
    line.scannedBy = actor
    line.scannedAt = new Date().toISOString()
    appendAuditEvent(store, box, "dispatched", actor, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      note: recipientName,
    })
  }
  recomputeLineSummary(store, order)
  setOrderStatus(store, order, "completed")
  refreshClientOpenOrderCount(store, order.clientId)
  persist()
  return order
}

export interface AuthoriseDestructionInput {
  name: string
  method: DestructionMethod
  reference?: string
}

export function authoriseDestruction(orderId: string, input: AuthoriseDestructionInput, actor: Actor): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  if (order.type !== "destruction") throw new Error("Not a destruction order")

  order.destruction = {
    method: input.method,
    authorisedBy:
      actor.side === "client" ? `${input.name} 
      // (client)
      ` : input.reference ? `${input.name} — ${input.reference}` : input.name,
    authorisedAt: new Date().toISOString().slice(0, 10),
  }

  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) {
    if (!line.boxId) continue
    const box = store.boxes.find((b) => b.id === line.boxId)
    if (!box) continue
    appendAuditEvent(store, box, "destruction_authorised", actor, {
      orderId: order.id,
      orderNumber: order.orderNumber,
    })
  }
  persist()
  return order
}

export function destroyOrder(orderId: string, witness: string | undefined, actor: Actor): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  if (order.type !== "destruction") throw new Error("Not a destruction order")
  if (!order.destruction) throw new Error("Destruction must be authorised first")
  if (witness) order.destruction.witness = witness

  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) {
    if (!line.boxId) continue
    const box = store.boxes.find((b) => b.id === line.boxId)
    if (!box) continue
    releaseBoxSlot(store, box)
    box.status = "destroyed"
    box.openOrder = undefined
    line.status = "destroyed"
    appendAuditEvent(store, box, "destroyed", actor, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      note: order.destruction.method,
      changes: witness ? [{ field: "witness", to: witness }] : undefined,
    })
  }
  recomputeLineSummary(store, order)
  setOrderStatus(store, order, "completed")
  refreshClientOpenOrderCount(store, order.clientId)
  persist()
  return order
}

/** Collection orders don't need pick/dispatch/destroy steps — complete just closes them out. */
export function completeOrder(orderId: string): Order {
  const store = load()
  const order = getOrderOrThrow(store, orderId)
  if (order.type !== "collection") throw new Error("Only collection orders can be completed directly")
  for (const line of store.orderLines.filter((l) => l.orderId === order.id)) line.status = "received"
  recomputeLineSummary(store, order)
  setOrderStatus(store, order, "completed")
  refreshClientOpenOrderCount(store, order.clientId)
  persist()
  return order
}

// --- Box registration & allocation (spec §7 "Register boxes") --------------------

export interface CreateBoxesBatchInput {
  clientId: string
  quantity: number
  description: string
  department?: string
  reference?: string
  filingDateFrom: string
  filingDateTo?: string
  destroyAfter?: string
  size: BoxSize
  orderId?: string
  orderNumber?: string
  overrides?: { index: number; description?: string; reference?: string }[]
}

export function createBoxesBatch(input: CreateBoxesBatchInput, actor: Actor): Box[] {
  const store = load()
  const client = store.clients.find((c) => c.id === input.clientId)
  if (!client) throw new Error("Client not found")

  const created: Box[] = []
  for (let i = 0; i < input.quantity; i++) {
    const seq = store.nextBoxSeq++
    const barcode = `BX${String(seq).padStart(8, "0")}`
    const override = input.overrides?.find((o) => o.index === i)
    const box: Box = {
      id: `box-${seq}`,
      boxNumber: barcode,
      barcode,
      clientId: client.id,
      clientName: client.name,
      description: override?.description ?? input.description,
      department: input.department,
      reference: override?.reference ?? input.reference,
      filingDateFrom: input.filingDateFrom,
      filingDateTo: input.filingDateTo,
      destroyAfter: input.destroyAfter,
      size: input.size,
      status: "unallocated",
      onHold: false,
      labelPrinted: false,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: actor,
    }
    store.boxes.push(box)
    appendAuditEvent(store, box, "registered", actor, { orderId: input.orderId, orderNumber: input.orderNumber })
    created.push(box)
  }

  client.boxCount = store.boxes.filter((b) => b.clientId === client.id).length
  persist()
  return created
}

export function markLabelsPrinted(boxIds: string[], actor: Actor): void {
  const store = load()
  for (const boxId of boxIds) {
    const box = store.boxes.find((b) => b.id === boxId)
    if (!box || box.labelPrinted) continue
    box.labelPrinted = true
    appendAuditEvent(store, box, "label_printed", actor)
  }
  persist()
}

export interface SuggestSlotsInput {
  clientId: string
  boxSizes: BoxSize[]
  warehouseId?: string
  preferSlotIds?: string[]
}

export function suggestSlotsForBoxes(input: SuggestSlotsInput): SlotSuggestion[] {
  const store = load()
  return suggestSlotsLogic(input, { slots: store.slots, racks: store.racks, boxes: store.boxes })
}

export interface AllocateBoxesInput {
  allocations: { boxId: string; slotId: string }[]
  reason?: string // required for Move, logged on the event
}

/** Allocates (or re-allocates, if the box already has a slot — i.e. Move) a box into a slot. */
export function allocateBoxes(input: AllocateBoxesInput, actor: Actor): Box[] {
  const store = load()
  const results: Box[] = []

  for (const { boxId, slotId } of input.allocations) {
    const box = store.boxes.find((b) => b.id === boxId)
    const slot = store.slots.find((s) => s.id === slotId)
    if (!box) throw new Error(`Box ${boxId} not found`)
    if (!slot) throw new Error(`Slot ${slotId} not found`)
    if (slot.status === "blocked") throw new Error(`Slot ${slot.code} is blocked`)

    const units = box.size === "large" ? 2 : 1
    const alreadyHere = box.slotId === slot.id
    const wasAllocatedElsewhere = !!box.slotId && !alreadyHere
    const freeCapacity = slot.capacity - slot.used + (alreadyHere ? units : 0)
    if (freeCapacity < units) throw new Error(`Slot ${slot.code} doesn't have room`)

    const fromLocation = box.locationPath

    if (wasAllocatedElsewhere) releaseBoxSlot(store, box)
    if (!alreadyHere) {
      slot.used += units
      slot.status = slot.used >= slot.capacity ? "full" : "available" // never "blocked" — guarded above
      recomputeRack(store, slot.rackId)
      recomputeWarehouse(store, slot.warehouseId)
    }

    box.slotId = slot.id
    box.locationPath = locationPathForSlotRef(store, slot)
    box.status = "stored"

    appendAuditEvent(store, box, wasAllocatedElsewhere ? "moved" : "allocated", actor, {
      fromLocation: wasAllocatedElsewhere ? fromLocation : undefined,
      toLocation: box.locationPath,
      note: input.reason,
    })
    results.push(box)
  }

  persist()
  return results
}

function locationPathForSlotRef(store: MockState, slot: Slot) {
  const rack = store.racks.find((r) => r.id === slot.rackId)
  const warehouse = store.warehouses.find((w) => w.id === slot.warehouseId)
  return {
    warehouse: warehouse?.code ?? slot.warehouseId,
    rack: rack ? `${rack.code[0]}-${rack.code.slice(1)}` : slot.rackId,
    slot: slot.code,
  }
}

// --- Box detail actions (spec §7 "Staff: Box detail") -----------------------------

export interface UpdateBoxDetailsInput {
  description?: string
  department?: string
  reference?: string
  filingDateFrom?: string
  filingDateTo?: string
  destroyAfter?: string
}

const EDITABLE_FIELD_LABELS: Record<keyof UpdateBoxDetailsInput, string> = {
  description: "description",
  department: "department",
  reference: "reference",
  filingDateFrom: "filing date from",
  filingDateTo: "filing date to",
  destroyAfter: "destroy after",
}

export function updateBoxDetails(boxId: string, patch: UpdateBoxDetailsInput, reason: string, actor: Actor): Box {
  const store = load()
  const box = store.boxes.find((b) => b.id === boxId)
  if (!box) throw new Error("Box not found")

  const changes: { field: string; from?: string; to?: string }[] = []
  for (const key of Object.keys(patch) as (keyof UpdateBoxDetailsInput)[]) {
    const nextValue = patch[key]
    if (nextValue === undefined || nextValue === box[key]) continue
    changes.push({ field: EDITABLE_FIELD_LABELS[key], from: box[key], to: nextValue })
    box[key] = nextValue
  }

  if (changes.length > 0) {
    appendAuditEvent(store, box, "details_edited", actor, { changes, note: reason })
    persist()
  }
  return box
}

export function placeBoxHold(boxId: string, reason: string, actor: Actor): Box {
  const store = load()
  const box = store.boxes.find((b) => b.id === boxId)
  if (!box) throw new Error("Box not found")
  box.onHold = true
  box.holdReason = reason
  appendAuditEvent(store, box, "hold_placed", actor, { note: reason })
  persist()
  return box
}

export function releaseBoxHold(boxId: string, actor: Actor): Box {
  const store = load()
  const box = store.boxes.find((b) => b.id === boxId)
  if (!box) throw new Error("Box not found")
  box.onHold = false
  box.holdReason = undefined
  appendAuditEvent(store, box, "hold_released", actor)
  persist()
  return box
}

export function markBoxMissing(boxId: string, note: string, actor: Actor): Box {
  const store = load()
  const box = store.boxes.find((b) => b.id === boxId)
  if (!box) throw new Error("Box not found")
  appendAuditEvent(store, box, "marked_missing", actor, { note })
  persist()
  return box
}
