import { http, HttpResponse, delay } from "msw"

import { actorFromSession } from "@/mocks/handlers/auth"
import {
  allocateBoxes,
  createBoxesBatch,
  getBoxByBarcode,
  getBoxById,
  getOrdersForBox,
  markBoxMissing,
  markLabelsPrinted,
  placeBoxHold,
  releaseBoxHold,
  searchBoxes,
  suggestSlotsForBoxes,
  updateBoxDetails,
  type AllocateBoxesInput,
  type BoxSearchParams,
  type CreateBoxesBatchInput,
  type SuggestSlotsInput,
  type UpdateBoxDetailsInput,
} from "@/mocks/store"
import type { BoxStatus } from "@/api/types"

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong"
  return HttpResponse.json({ message }, { status: 400 })
}

export const boxHandlers = [
  http.get("/api/boxes", async ({ request }) => {
    await delay(250)
    const url = new URL(request.url)
    const params: BoxSearchParams = {
      q: url.searchParams.get("q") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      onHold: url.searchParams.has("onHold") ? url.searchParams.get("onHold") === "true" : undefined,
      warehouseId: url.searchParams.get("warehouseId") ?? undefined,
      orderId: url.searchParams.get("orderId") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
    }
    const statusParam = url.searchParams.getAll("status") as BoxStatus[]
    if (statusParam.length) params.status = statusParam

    const { items, total } = searchBoxes(params)
    return HttpResponse.json({ items, total, page: params.page, pageSize: params.pageSize })
  }),

  http.post("/api/boxes/batch", async ({ request }) => {
    await delay(400)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const body = (await request.json()) as CreateBoxesBatchInput
    try {
      return HttpResponse.json(createBoxesBatch(body, actor), { status: 201 })
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/boxes/mark-label-printed", async ({ request }) => {
    await delay(200)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { boxIds } = (await request.json()) as { boxIds: string[] }
    markLabelsPrinted(boxIds, actor)
    return HttpResponse.json({ ok: true })
  }),

  http.post("/api/boxes/allocate-batch", async ({ request }) => {
    await delay(350)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const body = (await request.json()) as AllocateBoxesInput
    try {
      return HttpResponse.json(allocateBoxes(body, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.get("/api/boxes/by-barcode/:barcode", async ({ params }) => {
    await delay(150)
    const box = getBoxByBarcode(params.barcode as string)
    if (!box) return HttpResponse.json({ message: "Box not found" }, { status: 404 })
    return HttpResponse.json(box)
  }),

  http.get("/api/boxes/:boxId", async ({ params }) => {
    await delay(150)
    const box = getBoxById(params.boxId as string)
    if (!box) return HttpResponse.json({ message: "Box not found" }, { status: 404 })
    return HttpResponse.json(box)
  }),

  http.patch("/api/boxes/:boxId", async ({ params, request }) => {
    await delay(300)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { reason, ...patch } = (await request.json()) as UpdateBoxDetailsInput & { reason: string }
    try {
      return HttpResponse.json(updateBoxDetails(params.boxId as string, patch, reason, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/boxes/:boxId/hold", async ({ params, request }) => {
    await delay(250)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { reason } = (await request.json()) as { reason: string }
    try {
      return HttpResponse.json(placeBoxHold(params.boxId as string, reason, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.delete("/api/boxes/:boxId/hold", async ({ params }) => {
    await delay(250)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    try {
      return HttpResponse.json(releaseBoxHold(params.boxId as string, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.post("/api/boxes/:boxId/missing", async ({ params, request }) => {
    await delay(250)
    const actor = actorFromSession()
    if (!actor) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const { note } = (await request.json()) as { note: string }
    try {
      return HttpResponse.json(markBoxMissing(params.boxId as string, note, actor))
    } catch (err) {
      return errorResponse(err)
    }
  }),

  http.get("/api/boxes/:boxId/orders", async ({ params }) => {
    await delay(200)
    return HttpResponse.json(getOrdersForBox(params.boxId as string))
  }),

  http.post("/api/slots/suggest", async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as SuggestSlotsInput
    return HttpResponse.json(suggestSlotsForBoxes(body))
  }),
]
