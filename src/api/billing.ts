import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { invoiceSageSyncApi } from "@/api/invoices"
import { getSageInvoiceAmounts } from "@/api/sage"
import { actorSchema } from "@/api/types"

// Pricing and billing (Sprints 5-6): rate cards, charge events, billing runs. Approving a run makes one draft invoice
// per client (src/api/invoices.ts), which is then sent to Sage the usual way.

export const rateKeys = [
  "intakePerBox",
  "retrievalPerBox",
  "deliveryPerOrder",
  "collectionPerOrder",
  "destructionPerBox",
  "digitizePerBox",
] as const
export const RATE_LABEL: Record<(typeof rateKeys)[number], string> = {
  intakePerBox: "Intake, per box",
  retrievalPerBox: "Retrieval, per box",
  deliveryPerOrder: "Delivery, per dispatch",
  collectionPerOrder: "Collection, per order",
  destructionPerBox: "Destruction, per box",
  digitizePerBox: "Digitising, per box",
}

const ratesSchema = z.object({
  storagePerBoxMonth: z.record(z.string(), z.number()), // price per box size code (any size from Settings → Box sizes)
  intakePerBox: z.number(),
  retrievalPerBox: z.number(),
  deliveryPerOrder: z.number(),
  collectionPerOrder: z.number(),
  destructionPerBox: z.number(),
  digitizePerBox: z.number(),
})
export type Rates = z.infer<typeof ratesSchema>

const rateCardSchema = z.object({
  id: z.string(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional(),
  rates: ratesSchema,
  taxRateId: z.string(),
  notes: z.string().optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
})
export type RateCard = z.infer<typeof rateCardSchema>

export const chargeTypeSchema = z.enum([
  "intake",
  "storage",
  "retrieval",
  "delivery",
  "collection",
  "destruction",
  "digitize",
  "other",
])
export type ChargeType = z.infer<typeof chargeTypeSchema>

const chargeSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  chargeType: chargeTypeSchema,
  sourceType: z.string(),
  sourceKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
  taxRateId: z.string(),
  status: z.enum(["open", "invoiced", "voided"]),
  billingRunId: z.string().optional(),
  invoiceId: z.string().optional(),
  voidReason: z.string().optional(),
  createdAt: z.string(),
})
export type Charge = z.infer<typeof chargeSchema>

const totalsSchema = z.object({
  clients: z.array(z.object({ clientId: z.string(), clientName: z.string(), charges: z.number(), amount: z.number() })),
  amount: z.number(),
})

const runSchema = z.object({
  id: z.string(),
  runNumber: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(["draft", "approved"]),
  totals: totalsSchema.optional(),
  createdBy: actorSchema,
  createdAt: z.string(),
  approvedBy: actorSchema.optional(),
  approvedAt: z.string().optional(),
  charges: z.array(chargeSchema).optional(),
  invoices: z
    .array(
      z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        clientName: z.string(),
        netTotal: z.number(),
        status: z.string(),
      }),
    )
    .optional(),
})
export type BillingRun = z.infer<typeof runSchema>

const KEY = ["billing"] as const
const qs = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v))
  return sp.toString()
}
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY })
  qc.invalidateQueries({ queryKey: ["invoices"] })
}

export function useRateCards() {
  return useQuery({
    queryKey: [...KEY, "rate-cards"],
    queryFn: async () => parse(z.array(rateCardSchema), await apiClient.get("/billing/rate-cards")),
  })
}

export function useCreateRateCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientId?: string
      clientName?: string
      effectiveFrom: string
      rates: Rates
      taxRateId: string
      notes?: string
    }) => parse(rateCardSchema, await apiClient.post("/billing/rate-cards", input)),
    onSuccess: () => invalidate(qc),
  })
}

export function useCharges(params: {
  from?: string
  to?: string
  clientId?: string
  status?: string
  billingRunId?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: [...KEY, "charges", params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(chargeSchema), total: z.number(), amount: z.number() }),
        await apiClient.get(`/billing/charges?${qs(params)}`),
      ),
  })
}

export function useGenerateCharges() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { from: string; to: string; clientId?: string }) =>
      parse(
        z.object({ created: z.number(), amount: z.number(), clientsWithoutRateCard: z.array(z.string()) }),
        await apiClient.post("/billing/charges/generate", input),
      ),
    onSuccess: () => invalidate(qc),
  })
}

export function useAddCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientId: string
      clientName: string
      description: string
      quantity: number
      unitPrice: number
      taxRateId: string
      date?: string
    }) => parse(chargeSchema, await apiClient.post("/billing/charges", input)),
    onSuccess: () => invalidate(qc),
  })
}

export function useVoidCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      parse(chargeSchema, await apiClient.post(`/billing/charges/${id}/void`, { reason })),
    onSuccess: () => invalidate(qc),
  })
}

export function useBillingRuns() {
  return useQuery({
    queryKey: [...KEY, "runs"],
    queryFn: async () =>
      parse(z.object({ items: z.array(runSchema), total: z.number() }), await apiClient.get("/billing/runs")),
  })
}

export function useBillingRun(id: string) {
  return useQuery({
    queryKey: [...KEY, "runs", id],
    queryFn: async () => parse(runSchema, await apiClient.get(`/billing/runs/${id}`)),
  })
}

export function useCreateBillingRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { from: string; to: string }) =>
      parse(runSchema, await apiClient.post("/billing/runs", input)),
    onSuccess: () => invalidate(qc),
  })
}

export function useApproveBillingRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      parse(
        z.object({
          runNumber: z.string(),
          invoices: z.array(
            z.object({ id: z.string(), invoiceNumber: z.string(), clientName: z.string(), netTotal: z.number() }),
          ),
          totals: totalsSchema,
        }),
        await apiClient.post(`/billing/runs/${id}/approve`),
      ),
    onSuccess: () => invalidate(qc),
  })
}

export function useDiscardBillingRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/billing/runs/${id}`),
    onSuccess: () => invalidate(qc),
  })
}

// --- Clients' standing accounts (invoices in Sage: raised, paid, owed) -------------------------------------------

const accountSummarySchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  invoices: z.number(), // raised in the period
  paidInvoices: z.number(),
  unpaidInvoices: z.number(),
  invoiced: z.number(),
  paid: z.number(),
  outstanding: z.number(), // still owed on the period's invoices
  balance: z.number(), // still owed overall
  overdue: z.number(), // of the balance: past the due date
  lastInvoiceDate: z.string().optional(),
  lastSyncedAt: z.string().optional(),
})
export type AccountSummary = z.infer<typeof accountSummarySchema>

const accountInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  sageInvoiceNumber: z.string().optional(),
  invoiceDate: z.string(),
  dueDate: z.string(),
  orderId: z.string().optional(),
  currency: z.string(),
  total: z.number(),
  paid: z.number(),
  outstanding: z.number(),
  isPaid: z.boolean(),
  overdue: z.boolean(),
  paidAt: z.string().optional(),
  lastPaymentVia: z.string().optional(),
})
export type AccountInvoice = z.infer<typeof accountInvoiceSchema>

const totalsSchema2 = z.object({
  invoiced: z.number(),
  paid: z.number(),
  outstanding: z.number(),
  balance: z.number(),
  overdue: z.number(),
})

export function useAccounts(params: { from?: string; to?: string; q?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: [...KEY, "accounts", params],
    queryFn: async () =>
      parse(
        z.object({ items: z.array(accountSummarySchema), total: z.number(), totals: totalsSchema2 }),
        await apiClient.get(`/billing/accounts?${qs(params)}`),
      ),
  })
}

export function useClientAccount(
  clientId: string | undefined,
  params: { from?: string; to?: string; clientName?: string },
) {
  return useQuery({
    enabled: !!clientId,
    queryKey: [...KEY, "accounts", clientId, params],
    queryFn: async () =>
      parse(
        z.object({
          summary: accountSummarySchema,
          drafts: z.number(),
          items: z.array(accountInvoiceSchema),
          earlierUnpaid: z.array(accountInvoiceSchema),
        }),
        await apiClient.get(`/billing/accounts/${encodeURIComponent(clientId as string)}?${qs(params)}`),
      ),
  })
}

/**
 * "Update from Sage": reads what Sage says is still owed on our invoices (in this browser, with the Sage sign-in) and
 * records it — payments of on-account clients land in Sage. A fully paid order invoice also settles its order.
 */
export function useUpdateFromSage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clientId?: string) => {
      const toCheck = await invoiceSageSyncApi.toCheck(clientId)
      if (toCheck.length === 0) return { updated: 0, ordersPaid: 0, notFound: 0 }
      const amounts = await getSageInvoiceAmounts(toCheck)
      const items = toCheck.flatMap((i) => {
        const a = amounts.get(i.sageInvoiceId)
        return a ? [{ invoiceId: i.invoiceId, ...a }] : []
      })
      const result = items.length ? await invoiceSageSyncApi.report(items) : { updated: 0, ordersPaid: 0 }
      return { ...result, notFound: toCheck.length - items.length }
    },
    onSuccess: () => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ["orders"] })
    },
  })
}
