import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { actorSchema, boxSchema } from "@/api/types"

// Records management (Sprint 4): retention rules, the "due for destruction" review list, legal holds, certificates.

export const retentionTriggerSchema = z.enum(["filing_date_to", "filing_date_from", "registered"])
export type RetentionTrigger = z.infer<typeof retentionTriggerSchema>
export const RETENTION_TRIGGER_LABEL: Record<RetentionTrigger, string> = {
  filing_date_to: "after the latest document",
  filing_date_from: "after the earliest document",
  registered: "after it was registered with us",
}

const ruleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  retentionYears: z.number(),
  trigger: retentionTriggerSchema,
  version: z.number(),
  isCurrent: z.boolean(),
  notes: z.string().optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
})
export type RetentionRule = z.infer<typeof ruleSchema>

const holdSchema = z.object({
  id: z.string(),
  scope: z.enum(["box", "client", "category"]),
  boxId: z.string().optional(),
  boxNumber: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  category: z.string().optional(),
  authority: z.string(),
  reason: z.string(),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  status: z.enum(["active", "released"]),
  createdBy: actorSchema,
  createdAt: z.string(),
  releasedBy: actorSchema.optional(),
  releasedAt: z.string().optional(),
  releaseNote: z.string().optional(),
})
export type LegalHold = z.infer<typeof holdSchema>

const dueSchema = z.object({
  box: boxSchema,
  destructionDate: z.string(),
  basis: z.string(),
  heldBy: z.array(z.object({ id: z.string(), scope: z.string(), authority: z.string() })),
  onHold: z.boolean(),
})

export const certificateSchema = z.object({
  id: z.string(),
  certificateNumber: z.string(),
  orderId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  issuedAt: z.string(),
  content: z.object({
    orderNumber: z.string(),
    clientName: z.string(),
    method: z.string(),
    authorisedBy: z.string(),
    authorisedAt: z.string(),
    approvedBy: z.string().optional(),
    approvedAt: z.string().optional(),
    destroyedBy: z.string().optional(),
    destroyedAt: z.string(),
    witness: z.string().optional(),
    place: z.string().optional(),
    boxes: z.array(
      z.object({
        boxNumber: z.string(),
        barcode: z.string(),
        description: z.string(),
        reference: z.string().optional(),
        filingDateFrom: z.string().optional(),
        filingDateTo: z.string().optional(),
        retentionCategory: z.string().optional(),
      }),
    ),
  }),
})
export type DestructionCertificate = z.infer<typeof certificateSchema>

const KEY = ["records"] as const
const qs = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v))
  return sp.toString()
}

export function useRetentionRules(history = false) {
  return useQuery({
    queryKey: [...KEY, "rules", history],
    queryFn: async () =>
      parse(z.array(ruleSchema), await apiClient.get(`/records/retention-rules${history ? "?history=true" : ""}`)),
  })
}

export function useSaveRetentionRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      code: string
      name: string
      retentionYears: number
      trigger: RetentionTrigger
      notes?: string
    }) => parse(ruleSchema, await apiClient.post("/records/retention-rules", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDueForDestruction(params: { before?: string; clientId?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: [...KEY, "due", params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(dueSchema), total: z.number() }),
        await apiClient.get(`/records/due?${qs(params)}`),
      ),
  })
}

/** `coversBox` = the active holds covering that box (its own, its client's, its category's). */
export function useLegalHolds(params: {
  status?: "active" | "released"
  boxId?: string
  coversBox?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: [...KEY, "holds", params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(holdSchema), total: z.number() }),
        await apiClient.get(`/records/legal-holds?${qs(params)}`),
      ),
  })
}

export interface PlaceHoldInput {
  scope: "box" | "client" | "category"
  boxId?: string
  clientId?: string
  clientName?: string
  category?: string
  authority: string
  reason: string
  startsAt?: string
  endsAt?: string
}

export function usePlaceLegalHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PlaceHoldInput) => parse(holdSchema, await apiClient.post("/records/legal-holds", input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ["audit"] })
    },
  })
}

export function useReleaseLegalHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      parse(holdSchema, await apiClient.post(`/records/legal-holds/${id}/release`, { note })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useCertificates(params: { clientId?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: [...KEY, "certificates", params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(certificateSchema), total: z.number() }),
        await apiClient.get(`/records/certificates?${qs(params)}`),
      ),
  })
}

export function useOrderCertificate(orderId: string) {
  return useQuery({
    queryKey: [...KEY, "certificate", orderId],
    queryFn: async () => parse(certificateSchema, await apiClient.get(`/orders/${orderId}/certificate`)),
    retry: false,
  })
}
