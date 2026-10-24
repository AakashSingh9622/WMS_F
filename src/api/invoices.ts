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
  grossTotal: z.number().optional(), // Sage's total incl. VAT, once it is in Sage
  currency: z.string().optional(),
  orderId: z.string().optional(), // the order this invoice bills (billing stage)
  // standing account (issued invoices): paid so far — portal card, staff, or what Sage says after "Update from Sage"
  amountPaid: z.number().optional(),
  outstanding: z.number().optional(),
  paidAt: z.string().optional(),
  payments: z
    .array(
      z.object({
        amount: z.number(),
        method: z.string(),
        reference: z.string().optional(),
        note: z.string().optional(),
        via: z.string(),
        by: actorSchema,
        at: z.string(),
      }),
    )
    .optional(),
  sageSyncedAt: z.string().optional(),
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
  /** Only when creating: the order (at its billing stage) this invoice is for. */
  orderId?: string
  clientId: string
  clientName: string
  periodFrom?: string
  periodTo?: string
  invoiceDate: string
  dueDate: string
  notes?: string
  lines: InvoiceLine[]
}

const ORDERS = ["orders"] as const // every order query (an order's invoice moves its billing stage)

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
      if (inv.orderId) qc.invalidateQueries({ queryKey: ORDERS }) // the order's billing moved on
    },
  })
}

export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/invoices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: ORDERS })
    },
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
      grossTotal?: number // Sage's total incl. VAT — what the customer pays for an order's invoice
      currency?: string
      stripeCustomerId?: string // the client's Stripe customer (DocuSoft card) — lets the customer pay by card in the portal
    },
  ) => parse(invoiceSchema, await apiClient.post(`/invoices/${id}/issued`, body)),
  failed: async (id: string, message: string) =>
    parse(invoiceSchema, await apiClient.post(`/invoices/${id}/send-failed`, { message })),
}

/** A payment against an invoice in Sage (bank transfer seen, cheque, …) — counts on the client's standing account. */
export function useRecordInvoicePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: {
        amount: number
        method: "bank_transfer" | "card" | "other"
        reference?: string
        date?: string
        note?: string
      }
    }) => parse(invoiceSchema, await apiClient.post(`/invoices/${id}/payments`, input)),
    onSuccess: (inv) => {
      qc.setQueryData(KEYS.detail(inv.id), inv)
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: ["billing"] })
      qc.invalidateQueries({ queryKey: ORDERS })
    },
  })
}

// "Update from Sage" hand-over: which invoices to check, then what Sage says about them.
export const invoiceSageSyncApi = {
  toCheck: async (clientId?: string) =>
    parse(
      z.array(
        z.object({
          invoiceId: z.string(),
          invoiceNumber: z.string(),
          sageInvoiceId: z.string(),
          sageContactId: z.string().optional(),
          invoiceDate: z.string(),
        }),
      ),
      await apiClient.get(`/invoices/sage-sync${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
    ),
  report: async (items: { invoiceId: string; totalAmount: number; outstandingAmount: number }[]) =>
    parse(
      z.object({ updated: z.number(), ordersPaid: z.number() }),
      await apiClient.post("/invoices/sage-sync", { items }),
    ),
}

export function useInvalidateInvoice() {
  const qc = useQueryClient()
  return (inv?: Invoice) => {
    if (inv) qc.setQueryData(KEYS.detail(inv.id), inv)
    qc.invalidateQueries({ queryKey: KEYS.all })
    if (inv?.orderId) qc.invalidateQueries({ queryKey: ORDERS })
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
