import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import type { RecordImportRow } from "@/domain/record-import"

/**
 * Docbox "records": one folder / subfolder / contents row inside a box, with its own internal code. Not the same as a
 * box's Contents lines (BoxContent), which stay as they are.
 */
export const RECORD_STATUSES = ["archived", "on_loan", "in_transit", "destroyed"] as const
export type RecordStatus = (typeof RECORD_STATUSES)[number]

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  archived: "Archived",
  on_loan: "On loan",
  in_transit: "In transit",
  destroyed: "Destroyed",
}

const actorSchema = z.object({ id: z.string().optional(), name: z.string().optional(), side: z.string().optional() })

export const archiveRecordSchema = z.object({
  id: z.string(),
  internalCode: z.number(),
  clientId: z.string(),
  clientName: z.string(),
  expedienteId: z.string().optional(),
  expedienteCode: z.string().optional(),
  boxId: z.string(),
  boxNumber: z.string(),
  status: z.enum(RECORD_STATUSES),
  fields: z.record(z.string(), z.union([z.string(), z.number()])).optional(), // { C1: "...", C2: 5 } -- the client's own fields
  comments: z.string().optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ArchiveRecord = z.infer<typeof archiveRecordSchema>

export const archiveRecordEventSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  type: z.string(),
  note: z.string().optional(),
  actor: actorSchema,
  at: z.string(),
})
export type ArchiveRecordEvent = z.infer<typeof archiveRecordEventSchema>

const pageSchema = z.object({ items: z.array(archiveRecordSchema), total: z.number() })

export interface ArchiveRecordSearch {
  boxId?: string
  clientId?: string
  expedienteId?: string
  status?: RecordStatus[]
  /** an internal code (digits) */
  q?: string
  /** words found in the record's field values, comments or box number */
  text?: string
  page?: number
  pageSize?: number
}

function queryString(params: ArchiveRecordSearch) {
  const sp = new URLSearchParams()
  if (params.boxId) sp.set("boxId", params.boxId)
  if (params.clientId) sp.set("clientId", params.clientId)
  if (params.expedienteId) sp.set("expedienteId", params.expedienteId)
  for (const s of params.status ?? []) sp.append("status", s)
  if (params.q) sp.set("q", params.q)
  if (params.text) sp.set("text", params.text)
  sp.set("page", String(params.page ?? 1))
  sp.set("pageSize", String(params.pageSize ?? 50))
  return sp.toString()
}

const ROOT = "archive-records" as const

/** Server-paginated (at most 100 per page), newest internal code first. */
export function useArchiveRecords(params: ArchiveRecordSearch, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [ROOT, "list", params],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async () => parse(pageSchema, await apiClient.get(`/archive-records?${queryString(params)}`)),
  })
}

export function useArchiveRecordEvents(recordId: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT, "events", recordId],
    enabled: enabled && !!recordId,
    queryFn: async () => parse(z.array(archiveRecordEventSchema), await apiClient.get(`/archive-records/${recordId}/events`)),
  })
}

/** What the forms send: the client's own fields by code ("" clears an optional one) and the comments. */
export interface ArchiveRecordInput {
  fields?: Record<string, string>
  comments?: string
}

export function useCreateArchiveRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ArchiveRecordInput & { boxId: string }) =>
      parse(archiveRecordSchema, await apiClient.post("/archive-records", input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROOT] }),
  })
}

/** Docbox "Modificar": only the field codes sent change. */
export function useUpdateArchiveRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: ArchiveRecordInput & { id: string }) =>
      parse(archiveRecordSchema, await apiClient.patch(`/archive-records/${id}`, patch)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROOT] }),
  })
}

/** Docbox "Duplicar": a new record (new internal code) that starts as a copy, with what you send changed. */
export function useDuplicateArchiveRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: ArchiveRecordInput & { id: string; boxId?: string }) =>
      parse(archiveRecordSchema, await apiClient.post(`/archive-records/${id}/duplicate`, input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROOT] }),
  })
}

const importResultSchema = z.object({
  dryRun: z.boolean(),
  count: z.number(),
  firstCode: z.number().optional(),
  lastCode: z.number().optional(),
})

/** Bulk import of records: all rows are saved, or (422, `ApiError.rowErrors`) none are. `dryRun` only checks. */
export function useImportArchiveRecords() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { clientId: string; clientName?: string; expedienteId?: string; dryRun?: boolean; rows: RecordImportRow[] }) =>
      parse(importResultSchema, await apiClient.post("/archive-records/import", input)),
    onSuccess: (result) => {
      if (!result.dryRun) queryClient.invalidateQueries({ queryKey: [ROOT] })
    },
  })
}
