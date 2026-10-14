import { http, HttpResponse, delay } from "msw"

import { searchAuditEvents } from "@/mocks/store"
import type { AuditEventType } from "@/api/types"

export const auditHandlers = [
  http.get("/api/audit", async ({ request }) => {
    await delay(250)
    const url = new URL(request.url)
    const { items, total } = searchAuditEvents({
      boxId: url.searchParams.get("boxId") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      orderId: url.searchParams.get("orderId") ?? undefined,
      type: (url.searchParams.get("type") as AuditEventType) || undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
    })
    return HttpResponse.json({ items, total })
  }),
]
