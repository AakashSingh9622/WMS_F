import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { auditEventSchema, boxSchema, clientSchema, orderSchema } from "@/api/types"
import type { AuditEvent, Box, Order } from "@/api/types"

const portalSummarySchema = z.object({
  client: clientSchema.nullable(),
  boxCount: z.number(),
  boxesByStatus: z.record(z.string(), z.number()),
  openOrders: z.array(orderSchema),
  needsAuthorisation: z.array(orderSchema),
})
export type PortalSummary = z.infer<typeof portalSummarySchema>

export function usePortalSummary() {
  return useQuery({
    queryKey: queryKeys.portal.summary,
    queryFn: async (): Promise<PortalSummary> => parse(portalSummarySchema, await apiClient.get("/portal/summary")),
  })
}

const portalBoxesResponseSchema = z.object({ items: z.array(boxSchema), total: z.number() })

export function usePortalBoxes(params: { q?: string; page?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.portal.boxes(params),
    queryFn: async (): Promise<{ items: Box[]; total: number }> => {
      const sp = new URLSearchParams()
      if (params.q) sp.set("q", params.q)
      if (params.page) sp.set("page", String(params.page))
      return parse(portalBoxesResponseSchema, await apiClient.get(`/portal/boxes?${sp}`))
    },
  })
}

export function usePortalBox(boxId: string) {
  return useQuery({
    queryKey: queryKeys.portal.box(boxId),
    queryFn: async (): Promise<Box> => parse(boxSchema, await apiClient.get(`/portal/boxes/${boxId}`)),
    enabled: !!boxId,
  })
}

export function usePortalBoxHistory(boxId: string) {
  return useQuery({
    queryKey: queryKeys.portal.boxHistory(boxId),
    queryFn: async (): Promise<AuditEvent[]> =>
      parse(z.array(auditEventSchema), await apiClient.get(`/portal/boxes/${boxId}/history`)),
    enabled: !!boxId,
  })
}

export function usePortalOrders() {
  return useQuery({
    queryKey: queryKeys.portal.orders,
    queryFn: async (): Promise<Order[]> => parse(z.array(orderSchema), await apiClient.get("/portal/orders")),
  })
}

export function usePortalOrder(orderId: string) {
  return useQuery({
    queryKey: queryKeys.portal.order(orderId),
    queryFn: async (): Promise<Order> => parse(orderSchema, await apiClient.get(`/portal/orders/${orderId}`)),
    enabled: !!orderId,
  })
}

export interface CreatePortalOrderInput {
  type: Order["type"]
  boxIds?: string[]
  expectedNewBoxes?: number
  address?: string
  contactName?: string
  contactPhone?: string
  notes?: string
}

function invalidatePortalAndShared(queryClient: ReturnType<typeof useQueryClient>) {
  for (const prefix of ["portal", "orders", "boxes", "clients", "audit"]) {
    queryClient.invalidateQueries({ queryKey: [prefix] })
  }
}

export function useCreatePortalOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePortalOrderInput): Promise<Order> =>
      parse(orderSchema, await apiClient.post("/portal/orders", input)),
    onSuccess: () => invalidatePortalAndShared(queryClient),
  })
}

export function useCancelPortalOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string): Promise<Order> =>
      parse(orderSchema, await apiClient.post(`/portal/orders/${orderId}/cancel`)),
    onSuccess: () => invalidatePortalAndShared(queryClient),
  })
}

export function useAuthorisePortalDestruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, name }: { orderId: string; name: string }): Promise<Order> =>
      parse(orderSchema, await apiClient.post(`/portal/orders/${orderId}/authorise-destruction`, { name })),
    onSuccess: () => invalidatePortalAndShared(queryClient),
  })
}
