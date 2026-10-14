import { http, HttpResponse, delay } from "msw"

import { readSessionCookie } from "@/mocks/handlers/auth"
import {
  authoriseDestruction,
  cancelOrder,
  createOrder,
  getBoxById,
  getClientById,
  getOrderById,
  searchAuditEvents,
  searchBoxes,
  searchOrders,
  type CreateOrderInput,
} from "@/mocks/store"
import type { Actor } from "@/api/types"

// Portal endpoints never take a client ID from the caller — they're scoped to the
// session's own client server-side (spec §2/§6), so the frontend can't leak another
// client's data even by editing a URL.
function requireClientSession() {
  const claims = readSessionCookie()
  if (!claims || claims.side !== "client" || !claims.clientId) return null
  return claims
}

export const portalHandlers = [
  http.get("/api/portal/summary", async () => {
    await delay(200)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const client = getClientById(session.clientId!)
    const { items: openBoxes } = searchBoxes({ clientId: session.clientId, pageSize: 10_000 })
    const orders = searchOrders({ clientId: session.clientId })
    const byStatus = openBoxes.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1
      return acc
    }, {})
    return HttpResponse.json({
      client,
      boxCount: client?.boxCount ?? 0,
      boxesByStatus: byStatus,
      openOrders: orders.filter((o) => !["completed", "cancelled", "rejected"].includes(o.status)),
      needsAuthorisation: orders.filter((o) => o.type === "destruction" && o.status === "approved" && !o.destruction),
    })
  }),

  http.get("/api/portal/boxes", async ({ request }) => {
    await delay(250)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const url = new URL(request.url)
    const { items, total } = searchBoxes({
      clientId: session.clientId,
      q: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
    })
    return HttpResponse.json({ items, total })
  }),

  http.get("/api/portal/boxes/:boxId", async ({ params }) => {
    await delay(150)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const box = getBoxById(params.boxId as string)
    if (!box || box.clientId !== session.clientId) return HttpResponse.json({ message: "Not found" }, { status: 404 })
    return HttpResponse.json(box)
  }),

  http.get("/api/portal/boxes/:boxId/history", async ({ params }) => {
    await delay(200)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const box = getBoxById(params.boxId as string)
    if (!box || box.clientId !== session.clientId) return HttpResponse.json({ message: "Not found" }, { status: 404 })
    const { items } = searchAuditEvents({ boxId: box.id, visibleToClientOnly: true, pageSize: 500 })
    return HttpResponse.json(items)
  }),

  http.get("/api/portal/orders", async () => {
    await delay(200)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    return HttpResponse.json(searchOrders({ clientId: session.clientId }))
  }),

  http.get("/api/portal/orders/:orderId", async ({ params }) => {
    await delay(150)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const order = getOrderById(params.orderId as string)
    if (!order || order.clientId !== session.clientId) return HttpResponse.json({ message: "Not found" }, { status: 404 })
    return HttpResponse.json(order)
  }),

  http.post("/api/portal/orders", async ({ request }) => {
    await delay(300)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const body = (await request.json()) as Omit<CreateOrderInput, "clientId" | "requestedBy" | "requestedVia">
    const actor: Actor = { id: session.userId, name: session.name, side: "client" }

    for (const boxId of body.boxIds ?? []) {
      const box = getBoxById(boxId)
      if (!box || box.clientId !== session.clientId) {
        return HttpResponse.json({ message: "One of those boxes isn't yours" }, { status: 400 })
      }
    }

    try {
      const order = createOrder({ ...body, clientId: session.clientId!, requestedBy: actor, requestedVia: "portal" })
      return HttpResponse.json(order, { status: 201 })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      return HttpResponse.json({ message }, { status: 400 })
    }
  }),

  http.post("/api/portal/orders/:orderId/cancel", async ({ params }) => {
    await delay(250)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const order = getOrderById(params.orderId as string)
    if (!order || order.clientId !== session.clientId) return HttpResponse.json({ message: "Not found" }, { status: 404 })
    if (order.status !== "requested") {
      return HttpResponse.json({ message: "Only a still-requested order can be cancelled" }, { status: 400 })
    }
    const actor: Actor = { id: session.userId, name: session.name, side: "client" }
    return HttpResponse.json(cancelOrder(order.id, "Cancelled by client", actor))
  }),

  http.post("/api/portal/orders/:orderId/authorise-destruction", async ({ params, request }) => {
    await delay(300)
    const session = requireClientSession()
    if (!session) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const order = getOrderById(params.orderId as string)
    if (!order || order.clientId !== session.clientId) return HttpResponse.json({ message: "Not found" }, { status: 404 })
    const { name } = (await request.json()) as { name: string }
    const actor: Actor = { id: session.userId, name: session.name, side: "client" }
    try {
      return HttpResponse.json(authoriseDestruction(order.id, { name, method: order.destruction?.method ?? "shred" }, actor))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      return HttpResponse.json({ message }, { status: 400 })
    }
  }),
]
