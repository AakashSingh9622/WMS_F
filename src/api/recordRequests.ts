import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { locationPathSchema, type LocationPath } from "@/api/types"
import type { RequestImportRow } from "@/domain/record-request-import"

/**
 * Docbox "Peticiones": a client asks for several records at once. One request = one client, many records. Not the same as an
 * Order (which moves whole boxes).
 *   original  the paper goes to the client: the records are put on loan when the request is accepted (staff-made requests: at once)
 *   digital   a scan: the paper never leaves the box, so a digital request is never "on loan" and has nothing to return
 * A request asked for in the client portal starts as "pending" until staff accept it.
 */
export const RECORD_REQUEST_STATUSES = ["pending", "requested", "delivered", "returned", "cancelled"] as const
export type RecordRequestStatus = (typeof RECORD_REQUEST_STATUSES)[number]

export const RECORD_REQUEST_KINDS = ["original", "digital"] as const
export type RecordRequestKind = (typeof RECORD_REQUEST_KINDS)[number]
export const RECORD_REQUEST_KIND_LABELS: Record<RecordRequestKind, string> = { original: "Original", digital: "Digital copy" }

export const RECORD_REQUEST_STATUS_LABELS: Record<RecordRequestStatus, string> = {
  pending: "Pending acceptance",
  requested: "Accepted",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
}

const actorSchema = z.object({ id: z.string().optional(), name: z.string().optional(), side: z.string().optional() })

export const recordRequestLineSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  internalCode: z.number(),
  boxNumber: z.string(),
  summary: z.string().optional(),
  returnedAt: z.string().optional(),
  /** the record's own field values by code, and the place of its box now (for the printouts) */
  fields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  location: z.unknown().optional(), // read with lineLocation()
})

/** The place of a line's box; an odd old snapshot just shows no place instead of failing the whole page. */
export function lineLocation(line: { location?: unknown }): LocationPath | undefined {
  const parsed = locationPathSchema.safeParse(line.location)
  return parsed.success ? parsed.data : undefined
}

export const recordRequestSchema = z.object({
  id: z.string(),
  requestNumber: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  status: z.enum(RECORD_REQUEST_STATUSES),
  kind: z.enum(RECORD_REQUEST_KINDS),
  source: z.string(),
  loanType: z.string(),
  requestChannel: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  notes: z.string().optional(),
  recordCount: z.number(),
  requestedBy: actorSchema,
  deliveredAt: z.string().optional(),
  deliveredBy: actorSchema.optional(),
  closedAt: z.string().optional(),
  closedBy: actorSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(recordRequestLineSchema).optional(),
})
export type RecordRequest = z.infer<typeof recordRequestSchema>

const pageSchema = z.object({ items: z.array(recordRequestSchema), total: z.number() })

export interface RecordRequestSearch {
  clientId?: string
  status?: RecordRequestStatus[]
  kind?: RecordRequestKind
  source?: "staff" | "portal"
  /** a request number, a client name, or an internal code on the request */
  q?: string
  page?: number
  pageSize?: number
}

const ROOT = "record-requests" as const

export function useRecordRequests(params: RecordRequestSearch) {
  return useQuery({
    queryKey: [ROOT, "list", params],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (params.clientId) sp.set("clientId", params.clientId)
      if (params.kind) sp.set("kind", params.kind)
      if (params.source) sp.set("source", params.source)
      for (const s of params.status ?? []) sp.append("status", s)
      if (params.q) sp.set("q", params.q)
      sp.set("page", String(params.page ?? 1))
      sp.set("pageSize", String(params.pageSize ?? 25))
      return parse(pageSchema, await apiClient.get(`/record-requests?${sp.toString()}`))
    },
  })
}

export interface CreateRecordRequestInput {
  clientId: string
  recordIds: string[]
  loanType?: string
  requestChannel?: string
  contactName?: string
  contactEmail?: string
  notes?: string
}

/** All records go on loan together, or (409) none do. The records lists are refreshed afterwards. */
export function useCreateRecordRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateRecordRequestInput) => parse(recordRequestSchema, await apiClient.post("/record-requests", input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ROOT] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

export function useRecordRequest(id: string) {
  return useQuery({
    queryKey: [ROOT, "one", id],
    enabled: !!id,
    queryFn: async () => parse(recordRequestSchema, await apiClient.get(`/record-requests/${id}`)),
  })
}

/**
 * pending -> requested (ACCEPT) | cancelled; requested -> delivered | cancelled; delivered -> returned (originals only).
 * Accepting an original puts its records on loan; a digital request never touches a record. Cancelled / returned originals
 * put the records back (all or none); cancelling a pending request changes nothing physical.
 */
export function useChangeRecordRequestStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, to, note }: { id: string; to: Exclude<RecordRequestStatus, "pending">; note?: string }) =>
      parse(recordRequestSchema, await apiClient.post(`/record-requests/${id}/status`, { to, note })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ROOT] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

/** Only a pending or accepted request can be edited; the rest are read-only. */
export const isRecordRequestEditable = (r: { status: RecordRequestStatus }) => r.status === "pending" || r.status === "requested"

export interface EditRecordRequestInput {
  contactName?: string
  contactEmail?: string
  loanType?: string
  requestChannel?: string
  notes?: string
  addRecordIds?: string[]
  removeRecordIds?: string[]
  /** why — added to the request's and the records' history */
  note?: string
}

/**
 * Edits an open request, all or nothing: header fields and/or records added / removed. The client and the kind never change; a
 * portal request keeps its contact. An accepted original request puts added records on loan and gives removed ones back.
 */
export function useEditRecordRequest(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: EditRecordRequestInput) => parse(recordRequestSchema, await apiClient.patch(`/record-requests/${id}`, input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ROOT] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

export interface CorrectRecordRequestInput {
  /** exactly one of these two: the new status, or the new kind */
  to?: "requested" | "delivered" | "returned" | "cancelled"
  kind?: RecordRequestKind
  /** required: written to the request's and every record's history */
  reason: string
}

/**
 * Docbox "Modificar Peticiones": fixes a request after the fact (cancelled, a digital copy instead, a loan or return done by mistake).
 * The records' physical status follows the request; reopening needs them archived and free (else 409 and nothing changes).
 */
export function useCorrectRecordRequest(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CorrectRecordRequestInput) => parse(recordRequestSchema, await apiClient.post(`/record-requests/${id}/correct`, input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ROOT] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}

export const recordRequestEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  note: z.string().optional(),
  actor: actorSchema,
  at: z.string(),
})
export type RecordRequestEvent = z.infer<typeof recordRequestEventSchema>

/** The request's whole history, oldest first: created, accepted, delivered, returned, cancelled — who and when. */
export function useRecordRequestEvents(id: string) {
  return useQuery({
    queryKey: [ROOT, "events", id],
    enabled: !!id,
    queryFn: async () => parse(z.array(recordRequestEventSchema), await apiClient.get(`/record-requests/${id}/events`)),
  })
}

// --- import of record requests (Docbox "IMPORTACION PRESTAMOS") ----------------------------------------------------------

const importResultSchema = z.object({
  dryRun: z.boolean(),
  count: z.number(),
  requests: z.array(
    z.object({
      kind: z.string(),
      loanType: z.string(),
      contactEmail: z.string(),
      contactName: z.string().optional(),
      recordCount: z.number(),
      /** only after a real run */
      id: z.string().optional(),
      requestNumber: z.string().optional(),
    }),
  ),
})
export type RequestImportResult = z.infer<typeof importResultSchema>

export interface RequestImportInput {
  clientId: string
  clientName: string
  dryRun: boolean
  /** the client's DocuSoft contacts as this screen read them (nothing is stored); "Requested by" must be one of them */
  contacts: { email: string; name?: string }[]
  rows: RequestImportRow[]
}

/**
 * All requests are created, or (422, `ApiError.rowErrors`) none are. `dryRun` only checks and says which requests it would make.
 * Physical rows put their records on loan; digital rows never change the physical status.
 */
export function useImportRecordRequests() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RequestImportInput) => parse(importResultSchema, await apiClient.post("/record-requests/import", input)),
    onSuccess: (result) => {
      if (result.dryRun) return
      void queryClient.invalidateQueries({ queryKey: [ROOT] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
    },
  })
}
