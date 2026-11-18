import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"

const loansSchema = z.object({
  rows: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      expedienteCode: z.string().optional(), // only when the report is split by expediente
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
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      expedienteCode: z.string().optional(), // only when the report is split by expediente
      size: z.string(),
      status: z.string(),
      boxes: z.number(),
    })
  ),
  // keyed by client id, or "clientId|expedienteCode" when split by expediente
  records: z.record(z.string(), z.number()),
  containers: z.record(z.string(), z.number()),
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

const requestersSchema = z.array(z.object({ email: z.string(), name: z.string().optional(), orders: z.number() }))

function query(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const q = sp.toString()
  return q ? `?${q}` : ""
}

/** Loan requests by type and urgency per client (Docbox "Listado peticiones"): dates, file, who asked, request and loan type. */
export function useLoansReport(params: {
  clientId?: string
  from?: string
  to?: string
  expedienteId?: string
  requester?: string
  requestChannel?: string
  loanType?: string
  byExpediente?: string
}) {
  return useQuery({
    queryKey: ["reports", "loans", params],
    queryFn: async (): Promise<LoansReport> => parse(loansSchema, await apiClient.get(`/reports/loans${query(params)}`)),
  })
}

/** The contacts that have asked for loans ("Solicitado por"). */
export function useRequesters(clientId?: string) {
  return useQuery({
    queryKey: ["reports", "requesters", clientId ?? ""],
    queryFn: async () => parse(requestersSchema, await apiClient.get(`/reports/requesters${query({ clientId })}`)),
  })
}

/** The filters the archive and interfiling reports share (Docbox "Listado archivo"). */
export type ArchiveFilters = {
  clientId?: string
  expedienteId?: string
  site?: string
  warehouse?: string
  state?: string // archived | loan | transit
  status?: string // one box status; wins over state
  from?: string
  to?: string
}

/** Boxes that hold recorded files, with how many (Docbox "Intercalado por cliente"). Paged on the server. */
export function useInterfilingReport(params: ArchiveFilters & { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["reports", "interfiling", params],
    queryFn: async (): Promise<InterfilingReport> =>
      parse(
        interfilingSchema,
        await apiClient.get(`/reports/interfiling${query({ ...params, page: params.page ? String(params.page) : undefined, pageSize: params.pageSize ? String(params.pageSize) : undefined })}`),
      ),
  })
}

/** Boxes, recorded contents and containers per client, size and status (Docbox "Listado archivo"); optionally split by expediente. */
export function useArchiveReport(params: ArchiveFilters & { byExpediente?: string }) {
  return useQuery({
    queryKey: ["reports", "archive", params],
    queryFn: async (): Promise<ArchiveReport> => parse(archiveSchema, await apiClient.get(`/reports/archive${query(params)}`)),
  })
}
