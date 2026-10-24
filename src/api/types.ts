import { z } from "zod"

// Section 3: domain model. Every type has a matching zod schema so the API
// layer can validate responses at the boundary (see src/api/client.ts).

export const actorSideSchema = z.enum(["staff", "client", "system"])
export type ActorSide = z.infer<typeof actorSideSchema>

export const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  side: actorSideSchema,
})
export type Actor = z.infer<typeof actorSchema>

// Staff roles beyond staff_admin/staff_operator are assigned in Settings → Users; what each can do is in
// src/domain/permissions.ts.
export const roleSchema = z.enum([
  "staff_admin",
  "staff_operator",
  "warehouse_admin",
  "operations_manager",
  "records_manager",
  "finance_manager",
  "auditor",
  "client_admin",
  "client_user",
])
export type Role = z.infer<typeof roleSchema>

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  side: actorSideSchema.exclude(["system"]),
  roles: z.array(roleSchema),
  clientId: z.string().optional(),
})
export type User = z.infer<typeof userSchema>

// --- Locations: Warehouse -> Rack -> Slot ---------------------------------

export const warehouseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string().optional(),
  rackCount: z.number(),
  slotCount: z.number(),
  usedCapacity: z.number(),
  totalCapacity: z.number(),
})
export type Warehouse = z.infer<typeof warehouseSchema>

export const rackSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  code: z.string(),
  label: z.string(),
  rows: z.number(),
  columns: z.number(),
  cellLengthCm: z.number(), // length of one cell (row × column), in centimetres
  usedCapacity: z.number(),
  totalCapacity: z.number(),
})
export type Rack = z.infer<typeof rackSchema>

// available / full = an active cell; blocked / quarantined / inactive = locked (no new boxes, the ones inside stay).
export const slotStatusSchema = z.enum(["available", "full", "blocked", "quarantined", "inactive"])
export type SlotStatus = z.infer<typeof slotStatusSchema>

export const slotSchema = z.object({
  id: z.string(),
  rackId: z.string(),
  warehouseId: z.string(),
  code: z.string(),
  barcode: z.string(),
  row: z.number(),
  column: z.number(),
  capacity: z.number(),
  used: z.number(),
  status: slotStatusSchema,
})
export type Slot = z.infer<typeof slotSchema>

export const locationPathSchema = z.object({
  warehouse: z.string(),
  rack: z.string(),
  slot: z.string(),
})
export type LocationPath = z.infer<typeof locationPathSchema>

// --- Boxes ------------------------------------------------------------------

export const boxStatusSchema = z.enum([
  "unallocated",
  "stored",
  "reserved",
  "picked",
  "out",
  "pending_destruction",
  "destroyed",
  "missing",
  "digitized",
  "received", // at a warehouse's Goods-In, not on a shelf yet
  "return_pending", // with the client, on an open collection that brings it back
  "quarantined", // held back from every order until released
  "permanently_withdrawn", // given back to the client for good
])
export type BoxStatus = z.infer<typeof boxStatusSchema>

export const boxSizeSchema = z.enum(["standard", "large"])
export type BoxSize = z.infer<typeof boxSizeSchema>

export const orderTypeSchema = z.enum(["collection", "dispatch", "destruction", "digitize"])
export type OrderType = z.infer<typeof orderTypeSchema>

export const orderStatusSchema = z.enum([
  "requested",
  "approved",
  "scheduled",
  "in_progress",
  "ready", // every box picked — waiting to be dispatched / destroyed
  "on_hold", // paused by a supervisor; resume goes back to heldFromStatus
  "completed",
  "cancelled",
  "rejected",
])
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const boxOpenOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
})
export type BoxOpenOrder = z.infer<typeof boxOpenOrderSchema>

export const boxSchema = z.object({
  id: z.string(),
  boxNumber: z.string(),
  barcode: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  description: z.string(),
  department: z.string().optional(),
  reference: z.string().optional(),
  filingDateFrom: z.string(),
  filingDateTo: z.string().optional(),
  destroyAfter: z.string().optional(),
  size: boxSizeSchema,
  status: boxStatusSchema,
  onHold: z.boolean(),
  lengthCm: z.number().optional(), // cm this box takes in a cell (copied from the Box sizes setting when registered)
  holdReason: z.string().optional(),
  missingReason: z.string().optional(),
  missingAt: z.string().optional(),
  digitizedAt: z.string().optional(),
  goodsInWarehouseId: z.string().optional(), // status received: which warehouse's Goods-In
  quarantineReason: z.string().optional(),
  quarantinedAt: z.string().optional(),
  retentionCategory: z.string().optional(), // retention rule code (Records → Retention rules)
  labelPrinted: z.boolean(),
  slotId: z.string().optional(),
  locationPath: locationPathSchema.optional(),
  openOrder: boxOpenOrderSchema.optional(),
  createdAt: z.string(),
  createdBy: actorSchema,
})
export type Box = z.infer<typeof boxSchema>

// --- Orders -----------------------------------------------------------------

export const orderLineStatusSchema = z.enum([
  "pending",
  "picked",
  "dispatched",
  "received",
  "destroyed",
  "digitized",
  "missing",
  "removed",
])
export type OrderLineStatus = z.infer<typeof orderLineStatusSchema>

export const orderLineSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  boxId: z.string().optional(),
  boxNumber: z.string().optional(),
  status: orderLineStatusSchema,
  fromLocation: locationPathSchema.optional(), // snapshot: where the box was when it was added to the order
  currentLocation: locationPathSchema.optional(), // where the box is now (it may have been moved since)
  scannedAt: z.string().optional(),
  scannedBy: actorSchema.optional(),
})
export type OrderLine = z.infer<typeof orderLineSchema>

export const destructionMethodSchema = z.enum(["shred", "pulp", "incinerate"])
export type DestructionMethod = z.infer<typeof destructionMethodSchema>

export const orderDestructionSchema = z.object({
  method: destructionMethodSchema,
  authorisedBy: z.string(),
  authorisedAt: z.string(),
  witness: z.string().optional(),
  // second signature (records manager, not the person who prepared the order)
  approvedBy: z.object({ id: z.string(), name: z.string() }).optional(),
  approvedAt: z.string().optional(),
})
export type OrderDestruction = z.infer<typeof orderDestructionSchema>

// A digitize order: the client's sign-off is their name + an optional note (no method, unlike destruction).
export const orderDigitizationSchema = z.object({
  name: z.string(),
  note: z.string().optional(),
  authorisedBy: z.string(),
  authorisedAt: z.string(),
})
export type OrderDigitization = z.infer<typeof orderDigitizationSchema>

export const orderCollectionSchema = z.object({
  expectedNewBoxes: z.number(),
})
export type OrderCollection = z.infer<typeof orderCollectionSchema>

export const orderLineSummarySchema = z.record(orderLineStatusSchema, z.number())
export type OrderLineSummary = z.infer<typeof orderLineSummarySchema>

export const orderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  clientId: z.string(),
  clientName: z.string(),
  requestedBy: actorSchema,
  requestedVia: z.enum(["staff", "portal"]),
  createdAt: z.string(),
  scheduledFor: z.string().optional(),
  completedAt: z.string().optional(),
  address: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(), // the client contact this order is for; with clientId it scopes what a client-side login can see
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  boxCount: z.number(),
  lineSummary: orderLineSummarySchema,
  destruction: orderDestructionSchema.optional(),
  digitization: orderDigitizationSchema.optional(),
  collection: orderCollectionSchema.optional(),
  permanentWithdrawal: z.boolean().optional(), // dispatch: the boxes go back to the client for good
  heldFromStatus: orderStatusSchema.optional(), // on_hold: where resume goes back to
  holdReason: z.string().optional(),
  // destruction asked for by an ordinary client contact: waits for the client's main contact (portal)
  clientApprovalRequired: z.boolean().optional(),
  clientApprovedBy: z.string().optional(),
  clientApprovedAt: z.string().optional(),
  delivery: z
    .object({
      recipientName: z.string().optional(),
      courier: z.string().optional(),
      trackingRef: z.string().optional(),
      dispatchedAt: z.string().optional(),
      receivedBy: z.string().optional(),
      proofReference: z.string().optional(),
      deliveredAt: z.string().optional(),
    })
    .optional(),
})
export type Order = z.infer<typeof orderSchema>

// --- Audit history ------------------------------------------------------------

export const auditEventTypeSchema = z.enum([
  "registered",
  "label_printed",
  "allocated",
  "moved",
  "details_edited",
  "added_to_order",
  "removed_from_order",
  "picked",
  "dispatched",
  "collected",
  "received",
  "refiled",
  "marked_missing",
  "destruction_authorised",
  "destroyed",
  "digitization_authorised",
  "digitized",
  "hold_placed",
  "hold_released",
  "status_changed",
  "quarantined",
  "quarantine_released",
  "relabelled",
  "goods_in",
  "legal_hold_placed",
  "legal_hold_released",
  "destruction_approved",
  "contents_changed",
])
export type AuditEventType = z.infer<typeof auditEventTypeSchema>

export const auditFieldChangeSchema = z.object({
  field: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
})
export type AuditFieldChange = z.infer<typeof auditFieldChangeSchema>

export const auditEventSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  boxNumber: z.string(),
  clientId: z.string(),
  type: auditEventTypeSchema,
  at: z.string(),
  actor: actorSchema,
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
  fromLocation: locationPathSchema.optional(),
  toLocation: locationPathSchema.optional(),
  changes: z.array(auditFieldChangeSchema).optional(),
  note: z.string().optional(),
  visibleToClient: z.boolean(),
})
export type AuditEvent = z.infer<typeof auditEventSchema>

// --- Clients ------------------------------------------------------------------

export const clientAttributeTypeSchema = z.enum(["text", "date", "email", "phone", "url", "number"])
export type ClientAttributeType = z.infer<typeof clientAttributeTypeSchema>

export const clientAttributeSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  type: clientAttributeTypeSchema,
  group: z.string().optional(),
})
export type ClientAttribute = z.infer<typeof clientAttributeSchema>

export const clientStatusSchema = z.enum(["active", "inactive"])
export type ClientStatus = z.infer<typeof clientStatusSchema>

export const clientSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: clientStatusSchema,
  boxCount: z.number(),
  openOrderCount: z.number(),
  attributes: z.array(clientAttributeSchema),
})
export type Client = z.infer<typeof clientSchema>

// --- Slot suggestions -----------------------------------------------------

export const slotSuggestionSchema = z.object({
  slotId: z.string(),
  locationPath: locationPathSchema,
  freeCapacity: z.number(),
  score: z.number(),
  reasons: z.array(z.string()),
})
export type SlotSuggestion = z.infer<typeof slotSuggestionSchema>
