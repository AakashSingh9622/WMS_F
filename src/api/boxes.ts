import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { boxSchema, orderSchema, slotSchema, slotSuggestionSchema } from "@/api/types"
import type { Box, BoxSize, BoxStatus, Order, SlotSuggestion } from "@/api/types"

export interface BoxSearchInput {
  q?: string
  clientId?: string
  /** One of the client's expedientes. */
  expedienteId?: string
  /** Where it is (Docbox Busqueda): site, warehouse (code or name), floor, aisle, module (code or label) — typed text, any letter case. */
  site?: string
  warehouse?: string
  zone?: string
  aisle?: string
  module?: string
  /** Pallet / container (part of the number or type). */
  palletNo?: string
  containerNo?: string
  containerType?: string
  status?: BoxStatus[]
  onHold?: boolean
  warehouseId?: string
  rackId?: string
  row?: number
  orderId?: string
  /** Up to four of the client's own fields (Docbox "Campo / Dato"): code (C1…), the text, exact (=) or contains (Like). */
  cf?: { code: string; value: string; mode: "exact" | "contains" }[]
  /** "and" (Docbox "Y": every field must match, the default) or "or" ("O": any). */
  cfJoin?: "and" | "or"
  /** Ranges (Docbox "Num entre"): box numbers, pallet numbers, container numbers (whole numbers). */
  boxFrom?: string
  boxTo?: string
  palletFrom?: string
  palletTo?: string
  containerFrom?: string
  containerTo?: string
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
  if (input.expedienteId) sp.set("expedienteId", input.expedienteId)
  for (const key of ["site", "warehouse", "zone", "aisle", "module", "palletNo", "containerNo", "containerType"] as const) {
    if (input[key]) sp.set(key, input[key] as string)
  }
  if (input.warehouseId) sp.set("warehouseId", input.warehouseId)
  if (input.rackId) sp.set("rackId", input.rackId)
  if (input.row) sp.set("row", String(input.row))
  if (input.orderId) sp.set("orderId", input.orderId)
  if (input.cf?.length) {
    sp.set("cfs", JSON.stringify(input.cf))
    if (input.cfJoin === "or") sp.set("cfJoin", "or")
  }
  for (const key of ["boxFrom", "boxTo", "palletFrom", "palletTo", "containerFrom", "containerTo"] as const) {
    if (input[key]) sp.set(key, input[key] as string)
  }
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

/**
 * A box by a scanned / typed code: its current barcode or its box number (Sprint 11, "scan to see a box"). Not found ->
 * the query errors with the API's message ("No box has the barcode …").
 */
export function useBoxLookup(code: string) {
  return useQuery({
    queryKey: [...queryKeys.boxes.detail("lookup"), code],
    queryFn: async (): Promise<Box> =>
      parse(boxSchema, await apiClient.get(`/boxes/lookup?code=${encodeURIComponent(code)}`)),
    enabled: !!code,
    retry: false,
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
  customFields?: Record<string, string>
  palletNo?: string
  /** Docbox "NºContenedor" / "Tipo Contenedor" (template NCE, TYPECE): free text. */
  containerNo?: string
  containerType?: string
  comments?: string
  entryDate?: string
  /** Box number this one is a copy of (shown in its History). */
  duplicateOf?: string
  /** The client's expediente (needed when the client has any). */
  expedienteId?: string
  /** Put the boxes on a shelf as they are registered (Docbox's location in the same form). Module + shelf are what place them. */
  place?: { site?: string; warehouse?: string; floor?: string; aisle?: string; module?: string; shelf?: string }
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

export interface ImportBoxRow {
  description: string
  department?: string
  reference?: string
  filingDateFrom: string
  filingDateTo?: string
  destroyAfter?: string
  retentionCategory?: string
  size?: string
  /** The client's own fields by code: { C1: "Block 1", … } */
  customFields?: Record<string, string>
  palletNo?: string
  /** Docbox "NºContenedor" / "Tipo Contenedor" (template NCE, TYPECE): free text. */
  containerNo?: string
  containerType?: string
  /** Free-text remarks (Docbox "Observaciones"). Empty clears them on an edit. */
  comments?: string
  /** Day the box came in, YYYY-MM-DD (a file row or an edit; the import also takes one date for the whole file). */
  entryDate?: string
  /** Where to put the box (all optional; module + shelf are what place it): Docbox's Sede / Almacén / Planta / Pasillo / Módulo / Balda. */
  site?: string
  warehouse?: string
  floor?: string
  aisle?: string
  module?: string
  shelf?: string
}

export interface ImportBoxesInput {
  clientId: string
  clientName: string
  rows: ImportBoxRow[]
  /** The client's expediente the whole file goes into (needed when the client has any). */
  expedienteId?: string
  /** One entry date for the whole file (Docbox "Fecha Entrada"); today when left out. A row can carry its own. */
  entryDate?: string
  /** Only check the rows, save nothing. */
  dryRun?: boolean
}

const importResultSchema = z.object({
  dryRun: z.boolean(),
  count: z.number(),
  /** How many of them are (or, on a check, would be) put on a shelf because the row had a location. */
  placed: z.number().default(0),
  /** The boxes were registered but putting them on shelves failed — say why. */
  placeProblem: z.string().optional(),
  boxes: z.array(boxSchema),
})

/** Bulk registration from a spreadsheet: all rows are saved, or (422, `ApiError.rowErrors`) none are. */
export function useImportBoxes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ImportBoxesInput) => parse(importResultSchema, await apiClient.post("/boxes/import", input)),
    onSuccess: (result) => {
      if (!result.dryRun) invalidateBoxesAndShared(queryClient)
    },
  })
}

export interface BulkMoveRow {
  /** Box barcode or box number. */
  box: string
  /** Shelf or position code, e.g. "A-1" or "A-1-3". Leave empty when the module / shelf columns are used. */
  location?: string
  /** Docbox's separate columns, used instead of `location`. */
  site?: string
  warehouse?: string
  floor?: string
  aisle?: string
  module?: string
  shelf?: string
}

const bulkMoveResultSchema = z.object({ dryRun: z.boolean(), count: z.number() })

/** Move many boxes from a file: all moved, or (422, `ApiError.rowErrors`) none. */
export function useBulkMove() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { rows: BulkMoveRow[]; dryRun?: boolean; reason?: string }) =>
      parse(bulkMoveResultSchema, await apiClient.post("/boxes/bulk-move", input)),
    onSuccess: (result) => {
      if (!result.dryRun) invalidateBoxesAndShared(queryClient)
    },
  })
}

const resolveSchema = z.object({
  items: z.array(z.object({ code: z.string(), box: boxSchema.optional(), problem: z.string().optional() })),
})
export type ResolvedBox = z.infer<typeof resolveSchema>["items"][number]

/** Which box is behind each code of a file, and what stops it (other client, can't go on this kind of order …). */
export function useResolveBoxes() {
  return useMutation({
    mutationFn: async (input: { codes: string[]; clientId?: string; orderType?: "collection" | "dispatch" | "destruction" | "digitize" }) =>
      parse(resolveSchema, await apiClient.post("/boxes/resolve", input)),
  })
}

export interface CorrectBoxesInput {
  boxIds: string[]
  clientId?: string
  clientName?: string
  size?: Box["size"]
  description?: string
  department?: string
  reference?: string
  filingDateFrom?: string
  filingDateTo?: string
  destroyAfter?: string
  retentionCategory?: string
  palletNo?: string
  /** Docbox "NºContenedor" / "Tipo Contenedor" (template NCE, TYPECE): free text. */
  containerNo?: string
  containerType?: string
  comments?: string
  entryDate?: string
}

/** Register wizard, back on step 1: fix the details of the whole batch at once (client / size only while not filed). */
export function useCorrectRegisteredBoxes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CorrectBoxesInput): Promise<Box[]> =>
      parse(z.array(boxSchema), await apiClient.post("/boxes/correct-batch", input)),
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
  /** Only the client's own fields that change, by code; "" clears one. */
  customFields?: Record<string, string>
  palletNo?: string
  /** Docbox "NºContenedor" / "Tipo Contenedor" (template NCE, TYPECE): free text. */
  containerNo?: string
  containerType?: string
  /** Free-text remarks (Docbox "Observaciones"). Empty clears them on an edit. */
  comments?: string
  /** Day the box came in, YYYY-MM-DD (a file row or an edit; the import also takes one date for the whole file). */
  entryDate?: string
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
    mutationFn: async ({ boxId, reason }: { boxId: string; reason: string }): Promise<Box> =>
      parse(boxSchema, await apiClient.delete(`/boxes/${boxId}/hold?reason=${encodeURIComponent(reason)}`)),
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

export interface BoxContentInput {
  description: string
  reference?: string
  dateFrom?: string
  dateTo?: string
  docusoftDocumentId?: string
}

/** Docbox "Modificar" on a record: change its details (what is sent replaces the record; leave a field out to clear it). */
export function useUpdateBoxContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, contentId, input }: { boxId: string; contentId: string; input: BoxContentInput }) =>
      parse(boxContentSchema, await apiClient.patch(`/boxes/${boxId}/contents/${contentId}`, input)),
    onSuccess: () => invalidateBoxesAndShared(queryClient),
  })
}

/** Move a record into another box of the same client (box number or barcode). */
export function useMoveBoxContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ boxId, contentId, toBox, reason }: { boxId: string; contentId: string; toBox: string; reason?: string }) =>
      parse(boxContentSchema, await apiClient.post(`/boxes/${boxId}/contents/${contentId}/move`, { toBox, reason })),
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

export interface DocumentUploadLog {
  documents: { name: string; section?: string }[]
  /** The order the upload was made from, so it shows in that order's Activity as well as the box history. */
  orderId?: string
}

/** Writes "uploaded document X" to the box history (and the order's Activity). The files themselves go to DocuSoft. */
export function useRecordDocumentUpload(boxId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DocumentUploadLog) => apiClient.post(`/boxes/${boxId}/document-uploads`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit"] }),
  })
}
