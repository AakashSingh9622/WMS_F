import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { locationPathSchema, type LocationPath } from "@/api/types"

/**
 * Docbox "Devoluciones": records come back, by internal code (typed or scanned). The result is the shelving list — the
 * returned records in the order of where their box is, so they can be put back in one walk.
 */
export const shelvingItemSchema = z.object({
  id: z.string(),
  internalCode: z.number(),
  clientId: z.string(),
  clientName: z.string(),
  boxNumber: z.string(),
  fields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  comments: z.string().optional(),
  location: z.unknown().optional(), // read with itemLocation()
  requestNumber: z.string().optional(),
})
export type ShelvingItem = z.infer<typeof shelvingItemSchema>

/** The place of the box; an odd old snapshot just shows no place instead of failing the whole page. */
export function itemLocation(item: { location?: unknown }): LocationPath | undefined {
  const parsed = locationPathSchema.safeParse(item.location)
  return parsed.success ? parsed.data : undefined
}

const returnResultSchema = z.object({
  count: z.number(),
  closedRequests: z.array(z.string()),
  items: z.array(shelvingItemSchema),
})
export type ReturnResult = z.infer<typeof returnResultSchema>

/** All codes are returned, or (422, `ApiError.rowErrors` with the position of each bad code) none are. */
export function useReturnRecords() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { codes: string[]; note?: string }) => parse(returnResultSchema, await apiClient.post("/record-returns", input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["record-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

const importResultSchema = z.object({
  dryRun: z.boolean(),
  count: z.number(),
  closedRequests: z.array(z.string()).optional(),
  items: z.array(shelvingItemSchema).optional(),
})
export type ReturnImportResult = z.infer<typeof importResultSchema>

/** Docbox "Importar Devoluciones": the same return, from a file. All rows or (422, `ApiError.rowErrors` with the Excel row of each bad one) none; `dryRun` only checks. */
export function useImportReturns() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientId: string
      clientName: string
      dryRun: boolean
      note?: string
      rows: { row: number; internalCode: string; file: string; customer: string }[]
    }) => parse(importResultSchema, await apiClient.post("/record-returns/import", input)),
    onSuccess: (result) => {
      if (result.dryRun) return
      void queryClient.invalidateQueries({ queryKey: ["record-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

/** The shelving list again (for the print page): the same records, in shelf order. */
export function useShelvingList(ids: string[]) {
  return useQuery({
    queryKey: ["record-returns", "shelving", ids],
    enabled: ids.length > 0,
    queryFn: async () => parse(z.object({ items: z.array(shelvingItemSchema) }), await apiClient.get(`/record-returns/shelving?ids=${ids.join(",")}`)),
  })
}
