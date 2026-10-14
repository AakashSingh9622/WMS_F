import { http, HttpResponse, delay } from "msw"

import { getStore, resetStore, updateSlot } from "@/mocks/store"
import type { SlotStatus } from "@/api/types"

// Warehouse/Rack/Slot now have real routes on the backend (see next.config.ts rewrites) — these
// GET/PATCH handlers are no longer registered in handlers.ts, kept here only as a reference for
// the mock shape. The mock store's own warehouses/racks/slots arrays are still used internally by
// the Box/Order/Client mocks below (slot suggestions, locationPath display, etc.) since those
// haven't moved to the real backend yet — so two separate location datasets exist side by side
// until Boxes/Orders move too.
export const locationHandlers = [
  http.get("/api/warehouses", async () => {
    await delay(200)
    return HttpResponse.json(getStore().warehouses)
  }),

  http.get("/api/warehouses/:warehouseId", async ({ params }) => {
    await delay(150)
    const warehouse = getStore().warehouses.find((w) => w.id === params.warehouseId)
    if (!warehouse) return HttpResponse.json({ message: "Warehouse not found" }, { status: 404 })
    return HttpResponse.json(warehouse)
  }),

  http.get("/api/warehouses/:warehouseId/racks", async ({ params }) => {
    await delay(200)
    const racks = getStore().racks.filter((r) => r.warehouseId === params.warehouseId)
    return HttpResponse.json(racks)
  }),

  http.get("/api/racks/:rackId", async ({ params }) => {
    await delay(150)
    const rack = getStore().racks.find((r) => r.id === params.rackId)
    if (!rack) return HttpResponse.json({ message: "Rack not found" }, { status: 404 })
    return HttpResponse.json(rack)
  }),

  http.get("/api/racks/:rackId/slots", async ({ params }) => {
    await delay(200)
    const slots = getStore().slots.filter((s) => s.rackId === params.rackId)
    return HttpResponse.json(slots)
  }),

  http.patch("/api/slots/:slotId", async ({ params, request }) => {
    await delay(200)
    const body = (await request.json()) as { status?: SlotStatus; capacity?: number }
    try {
      const slot = updateSlot(params.slotId as string, body)
      return HttpResponse.json(slot)
    } catch {
      return HttpResponse.json({ message: "Slot not found" }, { status: 404 })
    }
  }),
]

// Kept live (see handlers.ts) regardless of where locations/auth are served from — Settings'
// "reset demo data" button still needs to reset the mock store's Box/Order/Client/Audit data.
export const mockUtilHandlers = [
  http.post("/api/mock/reset", async () => {
    await delay(300)
    resetStore()
    return HttpResponse.json({ ok: true })
  }),
]
