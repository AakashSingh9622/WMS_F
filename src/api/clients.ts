import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { boxSchema, clientSchema, orderSchema } from "@/api/types"
import type { Box, Client, Order } from "@/api/types"

// The generic "list all clients" endpoint is gone — client pickers now use
// useDocusoftAllClients() (src/api/docusoft.ts), since clients live only in DocuSoft. useClient()
// below is kept because the per-client detail page (/app/clients/[clientId]) still reads a single
// mock-seeded client by id — that page is a known placeholder until Box/Order move off the mock.
export function useClient(clientId: string) {
  return useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: async (): Promise<Client> => parse(clientSchema, await apiClient.get(`/clients/${clientId}`)),
    enabled: !!clientId,
  })
}

const clientStatsSchema = z.object({
  items: z.array(
    z.object({
      clientId: z.string(),
      inStorage: z.number(), // boxes in our warehouse (on a shelf, at Goods-In, on an order but not gone yet)
      out: z.number(), // with the client (dispatched / coming back)
      boxes: z.number(), // every box not destroyed or given back for good
      openOrders: z.number(),
      lastActivityAt: z.string().optional(),
      balance: z.number().optional(), // only when the user may see billing
      overdue: z.number().optional(),
    }),
  ),
  seesBilling: z.boolean(),
})
export type ClientStats = z.infer<typeof clientStatsSchema>["items"][number]

/** What we hold for every client (boxes, open orders, balance) in one call — the Clients list joins it to DocuSoft's. */
export function useClientStats() {
  return useQuery({
    queryKey: ["clients", "stats"],
    queryFn: async () => parse(clientStatsSchema, await apiClient.get("/clients/stats")),
    staleTime: 60_000,
  })
}

const clientBoxesResponseSchema = z.object({ items: z.array(boxSchema), total: z.number() })

export function useClientBoxes(clientId: string, params: { q?: string; page?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.clients.boxes(clientId, params),
    queryFn: async (): Promise<{ items: Box[]; total: number }> => {
      const sp = new URLSearchParams()
      if (params.q) sp.set("q", params.q)
      if (params.page) sp.set("page", String(params.page))
      return parse(clientBoxesResponseSchema, await apiClient.get(`/clients/${clientId}/boxes?${sp}`))
    },
    enabled: !!clientId,
  })
}

const clientOrdersResponseSchema = z.object({ items: z.array(orderSchema), total: z.number() })

export function useClientOrders(clientId: string, params: { page?: number } = {}) {
  return useQuery({
    queryKey: [...queryKeys.clients.orders(clientId), params],
    queryFn: async (): Promise<{ items: Order[]; total: number }> =>
      parse(clientOrdersResponseSchema, await apiClient.get(`/clients/${clientId}/orders?page=${params.page ?? 1}`)),
    enabled: !!clientId,
  })
}

const clientUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
})
export type ClientPortalUser = z.infer<typeof clientUserSchema>

export function useClientUsers(clientId: string) {
  return useQuery({
    queryKey: [...queryKeys.clients.detail(clientId), "users"],
    queryFn: async (): Promise<ClientPortalUser[]> =>
      parse(z.array(clientUserSchema), await apiClient.get(`/clients/${clientId}/users`)),
    enabled: !!clientId,
  })
}
