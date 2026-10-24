import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { boxSchema, orderSchema, slotSchema, slotSuggestionSchema } from "@/api/types"
import type { Box, BoxSize, BoxStatus, Order, SlotSuggestion } from "@/api/types"

export interface BoxSearchInput {
  q?: string
  clientId?: string
  status?: BoxStatus[]
  onHold?: boolean
  warehouseId?: string
  rackId?: string
  row?: number
  orderId?: string
  page?: number
  pageSize?: number
}

const boxSearchResponseSchema = z.object({
  items: z.array(boxSchema),
  total: z.number(),
})

function toSearchParams(input: BoxSearchInput): URLSearchParams {
  const sp = new URLSearchParams()
  if (input.q) sp.set("q", input.q)
  if (input.clientId) sp.set("clientId", input.clientId)
  if (input.warehouseId) sp.set("warehouseId", input.warehouseId)
  if (input.rackId) sp.set("rackId", input.rackId)
  if (input.row) sp.set("row", String(input.row))
  if (input.orderId) sp.set("orderId", input.orderId)
  if (input.onHold !== undefined) sp.set("onHold", String(input.onHold))
  if (input.page) sp.set("page", String(input.page))
  if (input.pageSize) sp.set("pageSize", String(input.pageSize))
  for (const s of input.status ?? []) sp.append("status", s)
  return sp
}

export function useBoxSearch(input: BoxSearchInput, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: queryKeys.boxes.search(input),
    queryFn: async (): Promise<{ items: Box[]; total: number }> =>
      parse(boxSearchResponseSchema, await apiClient.get(`/boxes?${toSearchParams(input)}`)),
  })
}

export function useBox(boxId: string) {
  return useQuery({
    queryKey: queryKeys.boxes.detail(boxId),
    queryFn: async (): Promise<Box> => parse(boxSchema, await apiClient.get(`/boxes/${boxId}`)),
    enabled: !!boxId,
  })
}

export function useBoxOrders(boxId: string) {
  return useQuery({
    queryKey: [...queryKeys.boxes.detail(boxId), "orders"],
    queryFn: async (): Promise<Order[]> => parse(z.array(orderSchema), await apiClient.get(`/boxes/${boxId}/orders`)),
    enabled: !!boxId,
  })
}

function invalidateBoxesAndShared(queryClient: ReturnType<typeof useQueryClient>) {
  for (const prefix of ["boxes", "clients", "audit", "warehouses", "racks", "orders"]) {
    queryClient.invalidateQueries({ queryKey: [prefix] })
  }
}

export interface CreateBoxesBatchInput {
  clientId: string
  clientName: string
  quantity: number
  description: string
  department?: string
  reference?: string
  filingDateFrom: string
  filingDateTo?: string
  destroyAfter?: string
  retentionCategory?: string
  size: BoxSize
  orderId?: string
  orderNumber?: string
  overrides?: { index: number; description?: string; reference?: string }[]
}

export function useCreateBoxesBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateBoxesBatchInput): Promise<Box[]> =>
      parse(z.array(boxSchema), await apiClient.post("/boxes/batch", input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useMarkLabelsPrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (boxIds: string[]) => apiClient.post("/boxes/mark-label-printed", { boxIds }),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export interface SuggestSlotsInput {
  clientId: string
  boxSizes: BoxSize[]
  warehouseId?: string
  preferSlotIds?: string[]
}

export function useSuggestSlots() {
  return useMutation({
    mutationFn: async (input: SuggestSlotsInput): Promise<SlotSuggestion[]> =>
      parse(z.array(slotSuggestionSchema), await apiClient.post("/slots/suggest", input)),
  })
}

export interface AllocateBoxesInput {
  allocations: { boxId: string; slotId: string }[]
  reason?: string
}

export function useAllocateBoxes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AllocateBoxesInput): Promise<Box[]> =>
      parse(z.array(boxSchema), await apiClient.post("/boxes/allocate-batch", input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export interface UpdateBoxDetailsInput {
  description?: string
  department?: string
  reference?: string
  filingDateFrom?: string
  filingDateTo?: string
  destroyAfter?: string
  retentionCategory?: string
  reason: string
}

export function useUpdateBoxDetails() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, input }: { boxId: string; input: UpdateBoxDetailsInput }): Promise<Box> =>
      parse(boxSchema, await apiClient.patch(`/boxes/${boxId}`, input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function usePlaceBoxHold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, reason }: { boxId: string; reason: string }): Promise<Box> =>
      parse(boxSchema, await apiClient.post(`/boxes/${boxId}/hold`, { reason })),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useReleaseBoxHold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (boxId: string): Promise<Box> => parse(boxSchema, await apiClient.delete(`/boxes/${boxId}/hold`)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useMarkBoxMissing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, note }: { boxId: string; note: string }): Promise<Box> =>
      parse(boxSchema, await apiClient.post(`/boxes/${boxId}/missing`, { note })),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

// --- Scanning (Goods-In, put-away), quarantine, re-label ----------------------------------------------------------

/** A registered box arrives at a warehouse's Goods-In. Scanning it twice is harmless (alreadyReceived). */
export function useReceiveAtGoodsIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { barcode: string; warehouseId: string }) =>
      parse(z.object({ box: boxSchema, alreadyReceived: z.boolean() }), await apiClient.post("/boxes/receive", input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

/** Box barcode + slot barcode → the box goes on that shelf. A mismatch is refused and queued for a supervisor. */
export function usePutAway() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { boxBarcode: string; slotBarcode: string; reason?: string }) =>
      parse(z.object({ box: boxSchema, slot: slotSchema }), await apiClient.post("/boxes/put-away", input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useQuarantineBox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, reason }: { boxId: string; reason: string }): Promise<Box> =>
      parse(boxSchema, await apiClient.post(`/boxes/${boxId}/quarantine`, { reason })),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useReleaseQuarantine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (boxId: string): Promise<Box> =>
      parse(boxSchema, await apiClient.delete(`/boxes/${boxId}/quarantine`)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

/** New barcode, same box. The old label stops scanning — print the new one. */
export function useRelabelBox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, reason }: { boxId: string; reason: string }): Promise<Box> =>
      parse(boxSchema, await apiClient.post(`/boxes/${boxId}/relabel`, { reason })),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

// --- Contents (what is in the box, optionally the DocuSoft document) --------------------------------------------

const boxContentSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  description: z.string(),
  reference: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  docusoftDocumentId: z.string().optional(),
  createdBy: z.object({ id: z.string(), name: z.string() }).passthrough(),
  createdAt: z.string(),
})
export type BoxContent = z.infer<typeof boxContentSchema>

export function useBoxContents(boxId: string) {
  return useQuery({
    queryKey: [...queryKeys.boxes.detail(boxId), "contents"],
    queryFn: async () => parse(z.array(boxContentSchema), await apiClient.get(`/boxes/${boxId}/contents`)),
  })
}

export function useAddBoxContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      boxId,
      input,
    }: {
      boxId: string
      input: {
        description: string
        reference?: string
        dateFrom?: string
        dateTo?: string
        docusoftDocumentId?: string
      }
    }) => parse(boxContentSchema, await apiClient.post(`/boxes/${boxId}/contents`, input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

export function useRemoveBoxContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, contentId }: { boxId: string; contentId: string }) =>
      apiClient.delete(`/boxes/${boxId}/contents/${contentId}`),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}
