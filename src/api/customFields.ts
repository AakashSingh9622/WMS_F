import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

/** A client's own box field (Docbox "Expedientes - Campos"): FOLDER, SUBFOLDER, CONTENTS ... */
export const customFieldSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  code: z.string(), // C1, C2 ... key inside Box.customFields
  name: z.string(),
  fieldType: z.enum(["text", "date", "number"]),
  required: z.boolean(),
  position: z.number(),
  active: z.boolean(),
  expedienteId: z.string().optional(), // set: only for that expediente; empty: for all of the client's expedientes
})
export type CustomField = z.infer<typeof customFieldSchema>
export type CustomFieldType = CustomField["fieldType"]

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = { text: "Text", date: "Date", number: "Number" }

const key = (clientId: string, includeInactive: boolean, expedienteId = "") => ["custom-fields", clientId, includeInactive, expedienteId] as const

/** The client's fields in order. Settings asks for retired ones too; registering / importing only needs the active ones. */
export function useCustomFields(clientId: string, options: { includeInactive?: boolean; expedienteId?: string } = {}) {
  const includeInactive = options.includeInactive ?? false
  const expedienteId = options.expedienteId ?? ""
  return useQuery({
    queryKey: key(clientId, includeInactive, expedienteId),
    enabled: !!clientId,
    queryFn: async (): Promise<CustomField[]> =>
      parse(
        z.array(customFieldSchema),
        await apiClient.get(
          `/custom-fields?clientId=${encodeURIComponent(clientId)}${includeInactive ? "&includeInactive=true" : ""}${expedienteId ? `&expedienteId=${encodeURIComponent(expedienteId)}` : ""}`
        )
      ),
  })
}

export function useCreateCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { clientId: string; name: string; fieldType: CustomFieldType; required: boolean; expedienteId?: string }) =>
      parse(customFieldSchema, await apiClient.post("/custom-fields", input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-fields"] }),
  })
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; required?: boolean; active?: boolean }) =>
      parse(customFieldSchema, await apiClient.patch(`/custom-fields/${id}`, patch)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-fields"] }),
  })
}
