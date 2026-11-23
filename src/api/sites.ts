import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

/** A site (Docbox "Sede"): the head office / place warehouses belong to. One can exist before it has a warehouse. */
export const siteSchema = z.object({
  name: z.string(),
  warehouseCount: z.number(),
  warehouses: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
})
export type Site = z.infer<typeof siteSchema>

const KEY = ["sites"] as const

export function useSites() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Site[]> => parse(z.array(siteSchema), await apiClient.get("/sites")),
  })
}

// A site name appears on warehouses and on boxes' places, so those lists refresh too.
function useRefresh() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY })
    queryClient.invalidateQueries({ queryKey: ["warehouses"] })
    queryClient.invalidateQueries({ queryKey: ["boxes"] })
  }
}

export function useCreateSite() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (name: string) => parse(siteSchema, await apiClient.post("/sites", { name })),
    onSuccess: refresh,
  })
}

export function useRenameSite() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async ({ name, newName }: { name: string; newName: string }) =>
      parse(siteSchema, await apiClient.patch("/sites", { name, newName })),
    onSuccess: refresh,
  })
}

export function useDeleteSite() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (name: string) => apiClient.delete(`/sites?name=${encodeURIComponent(name)}`),
    onSuccess: refresh,
  })
}
