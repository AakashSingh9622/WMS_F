import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { BOX_LENGTH_CM } from "@/domain/dimensions"
import { boxSizeTypeSchema, type BoxSize, type BoxSizeType } from "@/api/types"

// Box sizes (Sprint 11): the built-in standard / large plus any an admin adds — a name and the shelf length.
const boxSizeSettingsSchema = z.object({
  items: z.array(boxSizeTypeSchema),
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
    staleTime: 5 * 60_000, // changes rarely; saving refreshes it
  })
}

/** Every size (retired ones too — old boxes still show their name). Pickers filter on `active`. */
export function useBoxSizes(): BoxSizeType[] {
  return useBoxSizeSettings().data?.items ?? []
}

/** Length (cm) per box size code, as set by the admin. Falls back to the built-in defaults until it has loaded. */
export function useBoxLengths(): Record<BoxSize, number> {
  const items = useBoxSizes()
  return items.length
    ? { ...BOX_LENGTH_CM, ...Object.fromEntries(items.map((s) => [s.code, s.lengthCm])) }
    : BOX_LENGTH_CM
}

/** code -> display name ("archive-xl" -> "Archive XL"); unknown codes show as they are. */
export function useBoxSizeName(): (code: BoxSize) => string {
  const items = useBoxSizes()
  return (code) =>
    items.find((s) => s.code === code)?.name ?? (code === "large" ? "Large" : code === "standard" ? "Standard" : code)
}

function useRefreshSizes() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export function useCreateBoxSize() {
  const refresh = useRefreshSizes()
  return useMutation({
    mutationFn: async (input: { name: string; lengthCm: number }): Promise<BoxSizeType> =>
      parse(boxSizeTypeSchema, await apiClient.post("/settings/box-sizes", input)),
    onSuccess: refresh,
  })
}

/** Rename, change the length (boxes already registered keep theirs), retire (`active: false`) or bring back. */
export function useUpdateBoxSize() {
  const refresh = useRefreshSizes()
  return useMutation({
    mutationFn: async ({
      code,
      ...input
    }: {
      code: string
      name?: string
      lengthCm?: number
      active?: boolean
    }): Promise<BoxSizeType> => parse(boxSizeTypeSchema, await apiClient.patch(`/settings/box-sizes/${code}`, input)),
    onSuccess: refresh,
  })
}

/** Only a size no box uses, and not standard / large (the API says why otherwise). */
export function useDeleteBoxSize() {
  const refresh = useRefreshSizes()
  return useMutation({
    mutationFn: async (code: string) => {
      await apiClient.delete(`/settings/box-sizes/${code}`)
    },
    onSuccess: refresh,
  })
}
