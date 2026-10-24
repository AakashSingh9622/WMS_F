import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { actorSchema, roleSchema } from "@/api/types"
import type { Role } from "@/api/types"

// Staff users (Settings → Users & roles). Users come from DocuSoft; only the admin flag is DocuSoft's, every other
// role is assigned here. An e-mail can be given a role before the person's first login.
const staffUserSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  hasLoggedIn: z.boolean(),
  lastLoginAt: z.string().optional(),
  docusoftAdmin: z.boolean(),
  roles: z.array(roleSchema), // assigned here
  effectiveRoles: z.array(roleSchema), // what they can actually do (admin flag + roles, or operator by default)
})
export type StaffUser = z.infer<typeof staffUserSchema>

export function useStaffUsers() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: async () =>
      parse(z.object({ items: z.array(staffUserSchema), total: z.number() }), await apiClient.get("/users")),
  })
}

export function useSetUserRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, roles }: { email: string; roles: Role[] }): Promise<StaffUser> =>
      parse(staffUserSchema, await apiClient.put(`/users/${encodeURIComponent(email)}/roles`, { roles })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all })
      qc.invalidateQueries({ queryKey: queryKeys.adminAudit.all })
    },
  })
}

// --- System changes (admin audit log): roles, warehouse layout, settings ---------------------------------------

const adminAuditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().optional(),
  summary: z.string(),
  actor: actorSchema,
  at: z.string(),
})
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>

export function useAdminAudit(input: { entityType?: string; page?: number; pageSize?: number }) {
  const sp = new URLSearchParams()
  if (input.entityType) sp.set("entityType", input.entityType)
  if (input.page) sp.set("page", String(input.page))
  if (input.pageSize) sp.set("pageSize", String(input.pageSize))
  return useQuery({
    queryKey: queryKeys.adminAudit.search(input),
    queryFn: async () =>
      parse(
        z.object({ items: z.array(adminAuditEventSchema), total: z.number() }),
        await apiClient.get(`/admin-audit?${sp}`),
      ),
  })
}
