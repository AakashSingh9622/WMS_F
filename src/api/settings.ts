import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { BOX_LENGTH_CM } from "@/domain/dimensions"
import type { BoxSize } from "@/api/types"

const boxSizeSettingsSchema = z.object({
  sizes: z.object({ standard: z.number(), large: z.number() }),
  defaults: z.object({ standard: z.number(), large: z.number() }),
  updatedAt: z.string().nullable(),
  updatedBy: z.object({ name: z.string() }).nullable(),
})
export type BoxSizeSettings = z.infer<typeof boxSizeSettingsSchema>

const KEY = ["settings", "box-sizes"] as const

export function useBoxSizeSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<BoxSizeSettings> =>
      parse(boxSizeSettingsSchema, await apiClient.get("/settings/box-sizes")),
    staleTime: 5 * 60_000, // changes rarely; saving updates the cache
  })
}

/** Length (cm) per box size, as set by the admin. Falls back to the defaults until it has loaded. */
export function useBoxLengths(): Record<BoxSize, number> {
  const { data } = useBoxSizeSettings()
  return data?.sizes ?? BOX_LENGTH_CM
}

export function useUpdateBoxSizes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Record<BoxSize, number>>): Promise<BoxSizeSettings> =>
      parse(boxSizeSettingsSchema, await apiClient.put("/settings/box-sizes", input)),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
}
