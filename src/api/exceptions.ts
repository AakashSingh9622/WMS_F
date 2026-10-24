import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { actorSchema } from "@/api/types"

// Supervisor queue: scans that didn't match (unknown barcode, wrong box, full / unavailable slot) — refused at the
// scanner AND recorded here to be looked at, never silently corrected (spec §6.3).
export const exceptionTypeSchema = z.enum([
  "box_not_found",
  "slot_not_found",
  "wrong_box",
  "slot_unavailable",
  "slot_full",
  "box_unavailable",
])
export type ExceptionType = z.infer<typeof exceptionTypeSchema>

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  box_not_found: "Unknown box barcode",
  slot_not_found: "Unknown slot barcode",
  wrong_box: "Wrong box scanned",
  slot_unavailable: "Slot not in use",
  slot_full: "Slot full",
  box_unavailable: "Box can't be used",
}

const exceptionSchema = z.object({
  id: z.string(),
  type: exceptionTypeSchema,
  status: z.enum(["open", "resolved"]),
  message: z.string(),
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
  boxId: z.string().optional(),
  boxBarcode: z.string().optional(),
  slotId: z.string().optional(),
  slotBarcode: z.string().optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
  resolution: z.string().optional(),
  resolvedBy: actorSchema.optional(),
  resolvedAt: z.string().optional(),
})
export type OperationException = z.infer<typeof exceptionSchema>

const KEY = ["exceptions"] as const

export function useExceptions(
  params: { status?: "open" | "resolved"; page?: number; pageSize?: number },
  options: { enabled?: boolean } = {},
) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v))
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: [...KEY, params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(exceptionSchema), total: z.number(), open: z.number() }),
        await apiClient.get(`/exceptions?${sp}`),
      ),
  })
}

export function useResolveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) =>
      parse(exceptionSchema, await apiClient.post(`/exceptions/${id}/resolve`, { resolution })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
