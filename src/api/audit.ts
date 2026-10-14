import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { auditEventSchema } from "@/api/types"
import type { AuditEvent, AuditEventType } from "@/api/types"

export interface AuditSearchInput {
  boxId?: string
  clientId?: string
  orderId?: string
  type?: AuditEventType
  page?: number
  pageSize?: number
}

const auditResponseSchema = z.object({ items: z.array(auditEventSchema), total: z.number() })

function toSearchParams(input: AuditSearchInput): URLSearchParams {
  const sp = new URLSearchParams()
  if (input.boxId) sp.set("boxId", input.boxId)
  if (input.clientId) sp.set("clientId", input.clientId)
  if (input.orderId) sp.set("orderId", input.orderId)
  if (input.type) sp.set("type", input.type)
  if (input.page) sp.set("page", String(input.page))
  if (input.pageSize) sp.set("pageSize", String(input.pageSize))
  return sp
}

/**
 * Every event matching `input` (for CSV export), fetched page by page — the API caps one page at 100 rows, so
 * a big history is never pulled in a single request. Stops after `maxPages` as a safety net.
 */
export async function fetchAllAuditEvents(input: AuditSearchInput, maxPages = 50): Promise<AuditEvent[]> {
  const all: AuditEvent[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = parse(
      auditResponseSchema,
      await apiClient.get(`/audit?${toSearchParams({ ...input, page, pageSize: 100 })}`),
    )
    all.push(...res.items)
    if (all.length >= res.total || res.items.length === 0) break
  }
  return all
}

export function useAuditSearch(input: AuditSearchInput, options: { enabled?: boolean } = {}) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: queryKeys.audit.search(input),
    queryFn: async (): Promise<{ items: AuditEvent[]; total: number }> =>
      parse(auditResponseSchema, await apiClient.get(`/audit?${toSearchParams(input)}`)),
  })
}
