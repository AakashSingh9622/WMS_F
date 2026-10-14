import type { OrderStatus } from "@/api/types"

export class OrderTransitionError extends Error {
  code = "invalid_transition"
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Can't move an order from "${from}" to "${to}"`)
  }
}

// Spec §4: requested → approved → scheduled → in_progress → completed, with
// rejected only reachable from requested and cancelled reachable up until completed.
// The real backend should mirror this exactly (see docs/api-contract.md).
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
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
