import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

export interface LayoutRow {
  warehouse: string
  floor: string
  aisle: string
  module: string
  shelf: string
}

const resultSchema = z.object({
  dryRun: z.boolean(),
  warehouses: z.number(),
  zones: z.number(),
  aisles: z.number(),
  racks: z.number(),
  shelves: z.number(),
})
export type LayoutImportResult = z.infer<typeof resultSchema>

/** Build a whole warehouse layout from a sheet (one row per shelf). Checked first; a clean file creates everything. */
export function useImportLayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { rows: LayoutRow[]; columns: number; cellLengthCm: number; dryRun?: boolean }) =>
      parse(resultSchema, await apiClient.post("/warehouses/import-layout", input)),
    onSuccess: (r) => {
      if (!r.dryRun) for (const prefix of ["warehouses", "racks", "boxes"]) queryClient.invalidateQueries({ queryKey: [prefix] })
    },
  })
}
