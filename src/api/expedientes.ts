import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

/** A client's file (Docbox "Expedientes - Clientes"): PLANOS, … A client may have none, one or several. */
export const expedienteSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  code: z.string(),
  description: z.string(),
  format: z.string(), // delivery-note template (Docbox "Formato"): see domain/delivery-format
  deliveryColumns: z.array(z.string()), // fields on the delivery note, in order ("Ordenacion C1,C2,C3"); empty = the client's own choice
  createdAt: z.string(),
})
export type Expediente = z.infer<typeof expedienteSchema>

const key = (clientId: string) => ["expedientes", clientId] as const

export function useExpedientes(clientId: string) {
  return useQuery({
    queryKey: key(clientId),
    enabled: !!clientId,
    queryFn: async (): Promise<Expediente[]> =>
      parse(z.array(expedienteSchema), await apiClient.get(`/expedientes?clientId=${encodeURIComponent(clientId)}`)),
  })
}

export function useCreateExpediente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { clientId: string; code: string; description: string }) =>
      parse(expedienteSchema, await apiClient.post("/expedientes", input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expedientes"] }),
  })
}

export function useUpdateExpediente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; description?: string; format?: string; deliveryColumns?: string[] }) =>
      parse(expedienteSchema, await apiClient.patch(`/expedientes/${id}`, patch)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expedientes"] }),
  })
}

export function useDeleteExpediente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/expedientes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expedientes"] })
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] })
    },
  })
}
