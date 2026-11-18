import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

const loansSchema = z.object({
  rows: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      physicalUrgent: z.number(),
      physicalNormal: z.number(),
      digitalUrgent: z.number(),
      physicalSuperior: z.number(),
      digitalSuperior: z.number(),
      fax: z.number(),
      digitalNormal: z.number(),
      orders: z.number(),
      boxes: z.number(),
    })
  ),
})
export type LoansReport = z.infer<typeof loansSchema>

const archiveSchema = z.object({
  rows: z.array(
    z.object({ clientId: z.string(), clientName: z.string(), size: z.string(), status: z.string(), boxes: z.number() })
  ),
  records: z.record(z.string(), z.number()),
})
export type ArchiveReport = z.infer<typeof archiveSchema>

const interfilingSchema = z.object({
  items: z.array(
    z.object({
      boxId: z.string(),
      boxNumber: z.string(),
      clientId: z.string(),
      clientName: z.string(),
      status: z.string(),
      location: z.string().optional(),
      records: z.number(),
      filedFrom: z.string().optional(),
      filedTo: z.string().optional(),
    })
  ),
  total: z.number(),
})
export type InterfilingReport = z.infer<typeof interfilingSchema>

function query(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const q = sp.toString()
  return q ? `?${q}` : ""
}

/** Loan requests by type and urgency per client, for a date range (Docbox "Listado peticiones"). */
export function useLoansReport(params: { clientId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["reports", "loans", params],
    queryFn: async (): Promise<LoansReport> => parse(loansSchema, await apiClient.get(`/reports/loans${query(params)}`)),
  })
}

/** Boxes that hold recorded files, with how many (Docbox "Intercalado por cliente"). Paged on the server. */
export function useInterfilingReport(params: { clientId?: string; status?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["reports", "interfiling", params],
    queryFn: async (): Promise<InterfilingReport> =>
      parse(
        interfilingSchema,
        await apiClient.get(`/reports/interfiling${query({ ...params, page: params.page ? String(params.page) : undefined, pageSize: params.pageSize ? String(params.pageSize) : undefined })}`),
      ),
  })
}

/** Boxes per client, size and status, and recorded contents per client (Docbox "Listado archivo"). */
export function useArchiveReport(params: { clientId?: string; status?: string }) {
  return useQuery({
    queryKey: ["reports", "archive", params],
    queryFn: async (): Promise<ArchiveReport> => parse(archiveSchema, await apiClient.get(`/reports/archive${query(params)}`)),
  })
}
