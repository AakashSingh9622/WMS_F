import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

// The signed-in staff member's signature: always an image (data URL) plus how it was made. It goes onto every
// certificate of destruction they sign (copied at that moment, so later changes never alter an issued certificate).
export const signatureSchema = z.object({
  kind: z.enum(["drawn", "typed", "uploaded"]),
  image: z.string(),
  text: z.string().optional(),
  font: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Signature = z.infer<typeof signatureSchema>

const KEY = ["me", "signature"] as const

export function useMySignature() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      parse(z.object({ signature: signatureSchema.nullable() }), await apiClient.get("/me/signature")).signature,
  })
}

export function useSaveSignature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Signature, "updatedAt">) =>
      parse(z.object({ signature: signatureSchema }), await apiClient.put("/me/signature", input)).signature,
    onSuccess: (signature) => qc.setQueryData(KEY, signature),
  })
}

export function useRemoveSignature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete("/me/signature")
    },
    onSuccess: () => qc.setQueryData(KEY, null),
  })
}
