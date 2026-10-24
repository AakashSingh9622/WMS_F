import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import {
  boxStatusSchema,
  locationPathSchema,
  orderLineSchema,
  orderLineStatusSchema,
  orderSchema,
  orderStatusSchema,
  orderTypeSchema,
} from "@/api/types"
import type { DestructionMethod, Order, OrderLine, OrderStatus, OrderType } from "@/api/types"

export interface OrderSearchInput {
  type?: OrderType
  status?: OrderStatus[]
  clientId?: string
  q?: string
  page?: number
  pageSize?: number
}

const orderSearchResponseSchema = z.object({ items: z.array(orderSchema), total: z.number() })

function toSearchParams(input: OrderSearchInput): URLSearchParams {
  const sp = new URLSearchParams()
  if (input.type) sp.set("type", input.type)
  if (input.clientId) sp.set("clientId", input.clientId)
  if (input.q) sp.set("q", input.q)
  if (input.page) sp.set("page", String(input.page))
  if (input.pageSize) sp.set("pageSize", String(input.pageSize))
  for (const s of input.status ?? []) sp.append("status", s)
  return sp
}

export function useOrderSearch(input: OrderSearchInput) {
  return useQuery({
    queryKey: queryKeys.orders.search(input),
    queryFn: async (): Promise<{ items: Order[]; total: number }> =>
      parse(orderSearchResponseSchema, await apiClient.get(`/orders?${toSearchParams(input)}`)),
  })
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: async (): Promise<Order> => parse(orderSchema, await apiClient.get(`/orders/${orderId}`)),
    enabled: !!orderId,
  })
}

export function useOrderLines(orderId: string) {
  return useQuery({
    queryKey: queryKeys.orders.lines(orderId),
    queryFn: async (): Promise<OrderLine[]> =>
      parse(z.array(orderLineSchema), await apiClient.get(`/orders/${orderId}/lines`)),
    enabled: !!orderId,
  })
}

export interface CreateOrderInput {
  type: OrderType
  clientId: string
  clientName: string
  boxIds?: string[]
  expectedNewBoxes?: number
  address?: string
  contactName?: string
  /** Required: the client contact this order is for (lower-cased by the server). */
  contactEmail: string
  contactPhone?: string
  scheduledFor?: string
  notes?: string
  /** Dispatch only: the client keeps the boxes for good (they can't come back on a collection). */
  permanentWithdrawal?: boolean
}

// Every mutation below invalidates broadly (orders/boxes/clients/audit/warehouses/racks) rather
// than tracking exactly which entities changed — simpler and safe for a mock-data demo where
// query volume is small; a real backend integration would narrow this with precise keys.
function invalidateEverythingOrderTouches(queryClient: ReturnType<typeof useQueryClient>) {
  for (const prefix of ["orders", "boxes", "clients", "audit", "warehouses", "racks", "portal"]) {
    queryClient.invalidateQueries({ queryKey: [prefix] })
  }
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<Order> =>
      parse(orderSchema, await apiClient.post("/orders", input)),
    onSuccess: () => invalidateEverythingOrderTouches(queryClient),
  })
}

function useOrderAction<TInput = void>(path: (orderId: string) => string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, input }: { orderId: string; input?: TInput }): Promise<Order> =>
      parse(orderSchema, await apiClient.post(path(orderId), input)),
    onSuccess: () => invalidateEverythingOrderTouches(queryClient),
  })
}

export function useApproveOrder() {
  return useOrderAction((id) => `/orders/${id}/approve`)
}
export function useRejectOrder() {
  return useOrderAction<{ reason: string }>((id) => `/orders/${id}/reject`)
}
export function useScheduleOrder() {
  return useOrderAction<{ scheduledFor: string }>((id) => `/orders/${id}/schedule`)
}
export function useStartOrder() {
  return useOrderAction((id) => `/orders/${id}/start`)
}
export function useCancelOrder() {
  return useOrderAction<{ reason: string }>((id) => `/orders/${id}/cancel`)
}
export function useDispatchOrder() {
  return useOrderAction<{ recipientName: string; courier?: string; trackingRef?: string }>(
    (id) => `/orders/${id}/dispatch`,
  )
}
export function useAuthoriseDestruction() {
  return useOrderAction<{ name: string; method?: DestructionMethod; reference?: string }>(
    (id) => `/orders/${id}/authorise-destruction`,
  )
}
export function useAuthoriseDigitization() {
  return useOrderAction<{ name: string; note?: string; reference?: string }>(
    (id) => `/orders/${id}/authorise-digitization`,
  )
}

export function useDestroyOrder() {
  return useOrderAction<{ witness?: string; place?: string }>((id) => `/orders/${id}/destroy`)
}
/** Second signature on a destruction — a records manager who did not prepare the order. */
export function useApproveDestruction() {
  return useOrderAction((id) => `/orders/${id}/approve-destruction`)
}
/** Proof of delivery for a dispatched order. */
export function useRecordDelivery() {
  return useOrderAction<{ receivedBy: string; proofReference?: string; deliveredAt?: string }>(
    (id) => `/orders/${id}/delivered`,
  )
}
/** Collection: returning boxes that weren't scanned are received now, into this warehouse's Goods-In if given. */
export function useCompleteOrder() {
  return useOrderAction<{ warehouseId?: string }>((id) => `/orders/${id}/complete`)
}

/** Billing stage: a payment received outside the portal (bank transfer, card over the phone, …). billing.manage */
export function useRecordOrderPayment() {
  return useOrderAction<{
    method: "bank_transfer" | "card" | "other"
    reference?: string
    amount?: number
    note?: string
  }>((id) => `/orders/${id}/billing/payment`)
}
/** Billing stage: "payment not required" (billed monthly / annually on account) — the client only acknowledges. */
export function useSetPaymentRequired() {
  return useOrderAction<{ required: boolean }>((id) => `/orders/${id}/billing/payment-required`)
}
/** Billing stage: record that the client acknowledged the invoice (e.g. by email / phone). billing.manage */
export function useAcknowledgeOrderInvoice() {
  return useOrderAction<{ note?: string }>((id) => `/orders/${id}/billing/acknowledge`)
}
/** Billing stage: no invoice at all (no charge) — the order can be scheduled. billing.manage */
export function useWaiveOrderBilling() {
  return useOrderAction<{ reason: string }>((id) => `/orders/${id}/billing/waive`)
}

/** Supervisor: pause an order (reason required); resume goes back to where it was. */
export function useHoldOrder() {
  return useOrderAction<{ reason: string }>((id) => `/orders/${id}/hold`)
}
export function useResumeOrder() {
  return useOrderAction((id) => `/orders/${id}/resume`)
}

// --- Pick list and scanning ---------------------------------------------------------------------------------------

export const pickListLineSchema = z.object({
  lineId: z.string(),
  boxId: z.string(),
  boxNumber: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  lineStatus: orderLineStatusSchema,
  boxStatus: boxStatusSchema.optional(),
  slotBarcode: z.string().optional(),
  location: locationPathSchema.optional(),
  scannedAt: z.string().optional(),
})
export type PickListLine = z.infer<typeof pickListLineSchema>

/** The order's boxes in walking order (warehouse → rack → row → column); boxes not on a shelf come last. */
export function usePickList(orderId: string) {
  return useQuery({
    queryKey: [...queryKeys.orders.detail(orderId), "pick-list"],
    queryFn: async () =>
      parse(
        z.object({ order: orderSchema, lines: z.array(pickListLineSchema) }),
        await apiClient.get(`/orders/${orderId}/pick-list`),
      ),
  })
}

const scanResultSchema = z.object({
  order: orderSchema,
  boxNumber: z.string(),
  remaining: z.number(),
  alreadyPicked: z.boolean().optional(),
  alreadyReceived: z.boolean().optional(),
})
export type ScanResult = z.infer<typeof scanResultSchema>

function useScan<TInput>(path: (orderId: string) => string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, input }: { orderId: string; input: TInput }): Promise<ScanResult> =>
      parse(scanResultSchema, await apiClient.post(path(orderId), input)),
    onSuccess: () => invalidateEverythingOrderTouches(queryClient),
  })
}

/** One box scanned while picking (dispatch / destruction). Wrong box → refused and queued for a supervisor. */
export function usePickBox() {
  return useScan<{ barcode: string }>((id) => `/orders/${id}/pick`)
}

/** One returning box scanned for a collection; it waits at the warehouse's Goods-In until put away. */
export function useReceiveReturnBox() {
  return useScan<{ barcode: string; warehouseId?: string }>((id) => `/orders/${id}/receive`)
}

export { orderStatusSchema, orderTypeSchema }
