import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

/** Details we keep about a client on top of DocuSoft's: SAP code, tax ID and address (Docbox "Clientes"). */
const profileSchema = z.object({
  clientId: z.string(),
  sapCode: z.string(),
  taxId: z.string(),
  address: z.string(),
  postcode: z.string(),
  city: z.string(),
  province: z.string(),
  /** Columns on this client's delivery note, in order (built-in keys or custom field codes). */
  deliveryColumns: z.array(z.string()),
})
export type ClientProfile = z.infer<typeof profileSchema>
export type ClientProfileInput = Partial<Omit<ClientProfile, "clientId">>

export function useClientProfile(clientId: string) {
  return useQuery({
    queryKey: ["client-profile", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientProfile> =>
      parse(profileSchema, await apiClient.get(`/clients/${encodeURIComponent(clientId)}/profile`)),
  })
}

export function useSaveClientProfile(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ClientProfileInput): Promise<ClientProfile> =>
      parse(profileSchema, await apiClient.put(`/clients/${encodeURIComponent(clientId)}/profile`, input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-profile", clientId] }),
  })
}

/** What a contact may do: ask for loans (boxes, scans) and / or for destruction. No row = allowed. */
const permissionSchema = z.object({ email: z.string(), canLoan: z.boolean(), canPurge: z.boolean(), expedienteIds: z.array(z.string()) })
export type ContactPermission = z.infer<typeof permissionSchema>

export function useContactPermissions(clientId: string) {
  return useQuery({
    queryKey: ["contact-permissions", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ContactPermission[]> =>
      parse(z.array(permissionSchema), await apiClient.get(`/clients/${encodeURIComponent(clientId)}/contact-permissions`)),
  })
}

export function useSetContactPermission(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, ...flags }: { email: string; canLoan?: boolean; canPurge?: boolean; expedienteIds?: string[] }) =>
      parse(
        permissionSchema,
        await apiClient.put(`/clients/${encodeURIComponent(clientId)}/contact-permissions/${encodeURIComponent(email.toLowerCase())}`, flags)
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact-permissions", clientId] }),
  })
}
