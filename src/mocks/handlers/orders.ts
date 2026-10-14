import { http, HttpResponse, delay } from "msw"

import { actorFromSession } from "@/mocks/handlers/auth"
import {
  approveOrder,
  cancelOrder,
  completeOrder,
  createOrder,
  destroyOrder,
  dispatchOrder,
  authoriseDestruction,
  getOrderById,
  getOrderLines,
  rejectOrder,
  scheduleOrder,
  searchOrders,
  startOrder,
  type AuthoriseDestructionInput,
  type CreateOrderInput,
} from "@/mocks/store"
import type { DestructionMethod, OrderStatus, OrderType } from "@/api/types"

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong"
  return HttpResponse.json({ message }, { status: 400 })
}

export const orderHandlers = [
  http.get("/api/orders", async ({ request }) => {
    await delay(250)
    const url = new URL(request.url)
    const statusParam = url.searchParams.getAll("status") as OrderStatus[]
    const orders = searchOrders({
      type: (url.searchParams.get("type") as OrderType) || undefined,
      status: statusParam.length ? statusParam : undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    })
    return HttpResponse.json(orders)
  }),

  http.post("/api/orders", async ({ request }) => {
    await delay(300)
    const actor = actorFromSession()
    if (!actor || actor.side !== "staff") return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const body = (await request.json()) as Omit<CreateOrderInput, "requestedBy" | "requestedVia">
    try {
      const order = createOrder({ ...body, requestedBy: actor, requestedVia: "staff" })
      return HttpResponse.json(order, { status: 201 })
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.get("/api/orders/:orderId", async ({ params }) => {
    await delay(150)
    const order = getOrderById(params.orderId as string)
    if (!order) return HttpResponse.json({ message: "Order not found" }, { status: 404 })
    return HttpResponse.json(order)
  }),

  http.get("/api/orders/:orderId/lines", async ({ params }) => {
    await delay(200)
    return HttpResponse.json(getOrderLines(params.orderId as string))
  }),

  http.post("/api/orders/:orderId/approve", async ({ params }) => {
    await delay(250)
    try {
      return HttpResponse.json(approveOrder(params.orderId as string))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/reject", async ({ params, request }) => {
    await delay(250)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { reason } = (await request.json()) as { reason: string }
    try {
      return HttpResponse.json(rejectOrder(params.orderId as string, reason, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/schedule", async ({ params, request }) => {
    await delay(250)
    const { scheduledFor } = (await request.json()) as { scheduledFor: string }
    try {
      return HttpResponse.json(scheduleOrder(params.orderId as string, scheduledFor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/start", async ({ params }) => {
    await delay(250)
    try {
      return HttpResponse.json(startOrder(params.orderId as string))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/cancel", async ({ params, request }) => {
    await delay(250)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { reason } = (await request.json()) as { reason: string }
    try {
      return HttpResponse.json(cancelOrder(params.orderId as string, reason, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/dispatch", async ({ params, request }) => {
    await delay(300)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { recipientName } = (await request.json()) as { recipientName: string }
    try {
      return HttpResponse.json(dispatchOrder(params.orderId as string, recipientName, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/authorise-destruction", async ({ params, request }) => {
    await delay(300)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const body = (await request.json()) as { name: string; method?: DestructionMethod; reference?: string }
    const input: AuthoriseDestructionInput = { name: body.name, method: body.method ?? "shred", reference: body.reference }
    try {
      return HttpResponse.json(authoriseDestruction(params.orderId as string, input, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/destroy", async ({ params, request }) => {
    await delay(300)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { witness } = (await request.json()) as { witness?: string }
    try {
      return HttpResponse.json(destroyOrder(params.orderId as string, witness, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/orders/:orderId/complete", async ({ params }) => {
    await delay(250)
    try {
      return HttpResponse.json(completeOrder(params.orderId as string))
    } catch (err) {
      return errorResponse(err)
    }
  }),
]
