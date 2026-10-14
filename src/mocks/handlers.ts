import { mockUtilHandlers } from "@/mocks/handlers/locations"
import { clientHandlers } from "@/mocks/handlers/clients"
import { portalHandlers } from "@/mocks/handlers/portal"

// Auth, Warehouse/Rack/Slot, Box, Order, and Audit are no longer mocked here — they're served by
// the real backend via next.config.ts rewrites. Only the per-client detail routes (a known
// placeholder, see src/mocks/handlers/clients.ts) and the client-facing Portal stay mocked.
export const handlers = [...mockUtilHandlers, ...clientHandlers, ...portalHandlers]
