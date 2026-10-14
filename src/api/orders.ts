import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { orderLineSchema, orderSchema, orderStatusSchema, orderTypeSchema } from "@/api/types"
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
  return useOrderAction<{ recipientName: string }>((id) => `/orders/${id}/dispatch`)
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
  return useOrderAction<{ witness?: string }>((id) => `/orders/${id}/destroy`)
}
export function useCompleteOrder() {
  return useOrderAction((id) => `/orders/${id}/complete`)
}

export { orderStatusSchema, orderTypeSchema }
