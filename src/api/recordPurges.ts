import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import type { RecordPurgeRow } from "@/domain/record-purge"

/**
 * Purge and/or lend records by file. A file with any PURGE row is not run when it is uploaded: it becomes a pending
 * purge request (PRG-nnnnnn) and nothing is destroyed until a DIFFERENT person with approval rights approves it.
 */
const resultSchema = z.object({
  dryRun: z.boolean(),
  /** a check: how many rows would be purged / lent, and whether a second person has to approve */
  purgeCount: z.number().optional(),
  loanCount: z.number().optional(),
  needsApproval: z.boolean().optional(),
  /** the real thing: waiting for approval (purges), or done (loan-only file) */
  pending: z.boolean().optional(),
  purged: z.number().optional(),
  lent: z.number().optional(),
  requestNumber: z.string().optional(),
  requestId: z.string().optional(),
})
export type PurgeResult = z.infer<typeof resultSchema>

export interface PurgeByFileInput {
  clientId: string
  clientName: string
  dryRun: boolean
  rows: RecordPurgeRow[]
  /** describes the one request made for the rows marked loan */
  loan?: { loanType?: string; requestChannel?: string; contactName?: string; contactEmail?: string; notes?: string }
}

/** All rows are accepted, or (422, `ApiError.rowErrors`) none are. `dryRun` only checks. */
export function usePurgeRecordsByFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PurgeByFileInput) => parse(resultSchema, await apiClient.post("/record-purges", input)),
    onSuccess: (result) => {
      if (result.dryRun) return
      void queryClient.invalidateQueries({ queryKey: ["purge-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
      void queryClient.invalidateQueries({ queryKey: ["record-requests"] })
    },
  })
}

// --- the approval queue -------------------------------------------------------------------------------------------

export const PURGE_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const
export type PurgeRequestStatus = (typeof PURGE_REQUEST_STATUSES)[number]

export const PURGE_REQUEST_STATUS_LABELS: Record<PurgeRequestStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

const actorSchema = z.object({ id: z.string().optional(), name: z.string().optional(), side: z.string().optional() })

export const purgeRequestSchema = z.object({
  id: z.string(),
  requestNumber: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  status: z.enum(PURGE_REQUEST_STATUSES),
  purgeCount: z.number(),
  loanCount: z.number(),
  preparedBy: actorSchema,
  decidedBy: actorSchema.optional(),
  decidedAt: z.string().optional(),
  decisionNote: z.string().optional(),
  result: z
    .object({ purged: z.number().optional(), lent: z.number().optional(), requestNumber: z.string().optional(), requestId: z.string().optional() })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** the uploaded rows (only when one request is read) */
  rows: z
    .array(z.object({ row: z.number(), internalCode: z.string(), file: z.string(), customer: z.string(), action: z.string(), authorisedBy: z.string(), date: z.string() }))
    .optional(),
})
export type PurgeRequest = z.infer<typeof purgeRequestSchema>

const pageSchema = z.object({ items: z.array(purgeRequestSchema), total: z.number() })

export function usePurgeRequests(params: { status?: PurgeRequestStatus[]; q?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["purge-requests", "list", params],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const sp = new URLSearchParams()
      for (const s of params.status ?? []) sp.append("status", s)
      if (params.q) sp.set("q", params.q)
      sp.set("page", String(params.page ?? 1))
      sp.set("pageSize", String(params.pageSize ?? 25))
      return parse(pageSchema, await apiClient.get(`/record-purges/requests?${sp.toString()}`))
    },
  })
}

export function usePurgeRequest(id: string | null) {
  return useQuery({
    queryKey: ["purge-requests", "one", id],
    enabled: !!id,
    queryFn: async () => parse(purgeRequestSchema, await apiClient.get(`/record-purges/requests/${id}`)),
  })
}

/**
 * approve (a different person than the one who prepared it; every row is checked again, 422 + `rowErrors` if one is no
 * longer valid), reject (a reason is required) or cancel (only the person who prepared it).
 */
export function useDecidePurgeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "approve" | "reject" | "cancel"; note?: string }) =>
      parse(purgeRequestSchema, await apiClient.post(`/record-purges/requests/${id}/${action}`, action === "reject" ? { note } : {})),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purge-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
      void queryClient.invalidateQueries({ queryKey: ["record-requests"] })
    },
  })
}
