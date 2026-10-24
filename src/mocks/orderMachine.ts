import type { OrderStatus } from "@/api/types"

export class OrderTransitionError extends Error {
  code = "invalid_transition"
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Can't move an order from "${from}" to "${to}"`)
  }
}

// Spec §4: requested → approved → scheduled → in_progress → (ready) → completed, with
// rejected only reachable from requested and cancelled reachable up until completed.
// ready = every box picked; on_hold = paused (resume goes back to the order's heldFromStatus).
// Mirror of the backend's src/services/orderMachine.js — change both together.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  requested: ["approved", "rejected", "cancelled", "on_hold"],
  approved: ["scheduled", "cancelled", "on_hold"],
  scheduled: ["in_progress", "cancelled", "on_hold"],
  in_progress: ["ready", "completed", "cancelled", "on_hold"],
  ready: ["completed", "cancelled", "on_hold"],
  on_hold: ["requested", "approved", "scheduled", "in_progress", "ready", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new OrderTransitionError(from, to)
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}
