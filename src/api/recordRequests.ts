import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

/**
 * Docbox "Peticiones": a client asks for several records at once. One request = one client, many records. Creating it
 * puts every record on loan. Not the same as an Order (which moves whole boxes).
 */
export const RECORD_REQUEST_STATUSES = ["requested", "delivered", "returned", "cancelled"] as const
export type RecordRequestStatus = (typeof RECORD_REQUEST_STATUSES)[number]

export const RECORD_REQUEST_STATUS_LABELS: Record<RecordRequestStatus, string> = {
  requested: "Requested",
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
})

export const recordRequestSchema = z.object({
  id: z.string(),
  requestNumber: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  status: z.enum(RECORD_REQUEST_STATUSES),
  loanType: z.string(),
  requestChannel: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  notes: z.string().optional(),
  recordCount: z.number(),
  requestedBy: actorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(recordRequestLineSchema).optional(),
})
export type RecordRequest = z.infer<typeof recordRequestSchema>

const pageSchema = z.object({ items: z.array(recordRequestSchema), total: z.number() })

export interface RecordRequestSearch {
  clientId?: string
  status?: RecordRequestStatus[]
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
