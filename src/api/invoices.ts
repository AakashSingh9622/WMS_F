import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { actorSchema } from "@/api/types"

// Warehouse invoices (our backend). They're prepared here and created in Sage by the browser — see
// src/staff/features/billing/send-to-sage.ts for the hand-over (sending lock → Sage → issued / send-failed).

export const invoiceLineKinds = [
  "storage",
  "intake",
  "collection",
  "dispatch",
  "destruction",
  "digitize",
  "other",
] as const
export type InvoiceLineKind = (typeof invoiceLineKinds)[number]

export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(invoiceLineKinds),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  taxRateId: z.string(),
  ledgerAccountId: z.string().optional(),
  sourceType: z.literal("order").optional(),
  sourceId: z.string().optional(),
})
export type InvoiceLine = z.infer<typeof invoiceLineSchema>

export const invoiceStatusSchema = z.enum(["draft", "sending", "issued"])
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>

export const invoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  invoiceDate: z.string(),
  dueDate: z.string(),
  notes: z.string().optional(),
  status: invoiceStatusSchema,
  netTotal: z.number(),
  sendingSince: z.string().optional(),
  lastError: z.string().optional(),
  sageContactId: z.string().optional(),
  sageInvoiceId: z.string().optional(),
  sageInvoiceNumber: z.string().optional(),
  sageLink: z.string().optional(),
  issuedAt: z.string().optional(),
  issuedBy: actorSchema.optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
  lines: z.array(invoiceLineSchema).optional(),
  lineCount: z.number().optional(),
})
export type Invoice = z.infer<typeof invoiceSchema>

export interface InvoiceInput {
  clientId: string
  clientName: string
  periodFrom?: string
  periodTo?: string
  invoiceDate: string
  dueDate: string
  notes?: string
  lines: InvoiceLine[]
}

const KEYS = {
  all: ["invoices"] as const,
  list: (params: unknown) => ["invoices", "list", params] as const,
  detail: (id: string) => ["invoices", id] as const,
  sageSettings: ["settings", "sage"] as const,
}

export function useInvoices(params: {
  clientId?: string
  status?: InvoiceStatus
  q?: string
  page?: number
  pageSize?: number
}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v))
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () =>
      parse(z.object({ items: z.array(invoiceSchema), total: z.number() }), await apiClient.get(`/invoices?${sp}`)),
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: async () => parse(invoiceSchema, await apiClient.get(`/invoices/${id}`)),
  })
}

const suggestionSchema = z.object({ lines: z.array(invoiceLineSchema), alreadyInvoicedOrders: z.array(z.string()) })
export type InvoiceSuggestion = z.infer<typeof suggestionSchema>

export async function fetchSuggestedLines(clientId: string, from: string, to: string): Promise<InvoiceSuggestion> {
  const sp = new URLSearchParams({ clientId, from, to })
  return parse(suggestionSchema, await apiClient.get(`/invoices/suggest?${sp}`))
}

export function useSaveInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: InvoiceInput }): Promise<Invoice> =>
      parse(
        invoiceSchema,
        id ? await apiClient.put(`/invoices/${id}`, input) : await apiClient.post("/invoices", input),
      ),
    onSuccess: (inv) => {
      qc.setQueryData(KEYS.detail(inv.id), inv)
      qc.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

// The three hand-over steps of sending to Sage (used by send-to-sage.ts, not by screens directly).
export const invoiceSendApi = {
  start: async (id: string) => parse(invoiceSchema, await apiClient.post(`/invoices/${id}/sending`)),
  issued: async (
    id: string,
    body: {
      sageInvoiceId: string
      sageInvoiceNumber?: string
      sageLink?: string
      sageContactId?: string
      sageBusinessId?: string
    },
  ) => parse(invoiceSchema, await apiClient.post(`/invoices/${id}/issued`, body)),
  failed: async (id: string, message: string) =>
    parse(invoiceSchema, await apiClient.post(`/invoices/${id}/send-failed`, { message })),
}

export function useInvalidateInvoice() {
  const qc = useQueryClient()
  return (inv?: Invoice) => {
    if (inv) qc.setQueryData(KEYS.detail(inv.id), inv)
    qc.invalidateQueries({ queryKey: KEYS.all })
  }
}

// --- Sage defaults (backend app_setting) ---------------------------------------------------------------------------

const sageSettingsSchema = z.object({
  defaultLedgerAccountId: z.string().nullable(),
  defaultLedgerAccountName: z.string().nullable(),
  defaultTaxRateId: z.string(),
  paymentTermsDays: z.number(),
  updatedAt: z.string().nullable(),
  updatedBy: actorSchema.nullable(),
})
export type SageSettings = z.infer<typeof sageSettingsSchema>

export function useSageSettings() {
  return useQuery({
    queryKey: KEYS.sageSettings,
    queryFn: async () => parse(sageSettingsSchema, await apiClient.get("/settings/sage")),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateSageSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: Partial<
        Pick<
          SageSettings,
          "defaultLedgerAccountId" | "defaultLedgerAccountName" | "defaultTaxRateId" | "paymentTermsDays"
        >
      >,
    ) => parse(sageSettingsSchema, await apiClient.put("/settings/sage", input)),
    onSuccess: (data) => qc.setQueryData(KEYS.sageSettings, data),
  })
}
