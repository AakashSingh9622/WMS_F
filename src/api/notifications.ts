import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

// Staff in-app notifications (no email yet): what clients do in the portal — new requests, cancellations, approvals,
// destruction / digitising sign-offs, card payments, acknowledged invoices. Read / unread is per staff member.
const staffNotificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string().optional(),
  orderId: z.string().optional(),
  clientId: z.string().optional(),
  createdAt: z.string(),
  read: z.boolean(),
})
export type StaffNotification = z.infer<typeof staffNotificationSchema>

const KEY = ["notifications"] as const
const POLL_MS = 30_000 // the bell checks twice a minute (no push channel yet)

export function useStaffNotifications(pageSize = 8) {
  return useQuery({
    queryKey: [...KEY, "list", pageSize],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(staffNotificationSchema), total: z.number(), unread: z.number() }),
        await apiClient.get(`/notifications?pageSize=${pageSize}`),
      ),
    refetchInterval: POLL_MS,
  })
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [...KEY, "unread"],
    queryFn: async () =>
      parse(z.object({ unread: z.number() }), await apiClient.get("/notifications/unread-count")).unread,
    refetchInterval: POLL_MS,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/notifications/${id}/read`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/notifications/read-all")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
