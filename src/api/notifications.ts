import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

// Staff in-app notifications (decided 24 Oct: no email yet): new portal requests, client approvals, ...
const staffNotificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string().optional(),
  orderId: z.string().optional(),
  createdAt: z.string(),
})
export type StaffNotification = z.infer<typeof staffNotificationSchema>

export function useStaffNotifications(pageSize = 8) {
  return useQuery({
    queryKey: ["notifications", pageSize],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(staffNotificationSchema), total: z.number() }),
        await apiClient.get(`/notifications?pageSize=${pageSize}`),
      ),
    refetchInterval: 60_000,
  })
}
