import type { Box, Order, OrderStatus, OrderType, Role } from "@/api/types"
import { can } from "@/domain/permissions"
import { canTransition } from "@/mocks/orderMachine"

/** Why a box can't be added to a new order of this type, or null if it's eligible (spec §4). */
export function getBoxIneligibilityReason(box: Box, type: OrderType): string | null {
  if (type === "collection") {
    if (box.status !== "out") return "Only boxes currently out with the client can be returned on a collection"
    return null
  }
  // digitize: like destruction, but a box that is already digitized has nothing left to scan
  if (type === "digitize") {
    if (box.onHold) return `On hold — ${box.holdReason ?? "reason not given"}`
    if (box.openOrder) return `Already on order ${box.openOrder.orderNumber}`
    if (box.status === "digitized") return "Already digitized"
    if (box.status !== "stored") return `Box is ${box.status.replace("_", " ")}, not stored`
    return null
  }
  // dispatch + destruction (a digitized box is still in its slot, so it can be sent back or destroyed)
  if (box.onHold) return `On hold — ${box.holdReason ?? "reason not given"}`
  if (box.openOrder) return `Already on order ${box.openOrder.orderNumber}`
  if (box.status !== "stored" && box.status !== "digitized") return `Box is ${box.status.replace("_", " ")}, not stored`
  return null
}

export function isDestroyAfterInFuture(box: Box): boolean {
  if (!box.destroyAfter) return false
  return new Date(box.destroyAfter) > new Date()
}

export interface OrderActions {
  canApprove: boolean
  canReject: boolean
  canSchedule: boolean
  canStart: boolean
  canCancel: boolean
  canDispatch: boolean
  canAuthoriseDestruction: boolean
  canAuthoriseDigitization: boolean
  /** The "fix-box-scan" button of a digitize order (opens the scan app, wired up later). */
  canFixBoxScan: boolean
  canDestroy: boolean
  canComplete: boolean
}

/** Which action buttons the staff order-detail screen should show, given status/type/role (spec §7). */
export function getOrderActions(order: Order, roles: readonly Role[]): OrderActions {
  const s = order.status
  const next = (to: OrderStatus) => canTransition(s, to)
  const operate = can(roles, "orders.operate")
  const approve = can(roles, "orders.approve")
  const authorise = can(roles, "orders.authorise")

  return {
    canApprove: approve && next("approved"),
    canReject: approve && next("rejected"),
    canSchedule: operate && next("scheduled"),
    canStart: operate && next("in_progress"),
    canCancel: operate && next("cancelled"),
    canDispatch: operate && s === "in_progress" && order.type === "dispatch",
    canAuthoriseDestruction:
      authorise && order.type === "destruction" && !order.destruction && (s === "approved" || s === "scheduled"),
    canAuthoriseDigitization:
      authorise && order.type === "digitize" && !order.digitization && (s === "approved" || s === "scheduled"),
    canFixBoxScan: operate && order.type === "digitize" && (s === "scheduled" || s === "in_progress"),
    canDestroy: operate && s === "in_progress" && order.type === "destruction" && !!order.destruction,
    canComplete: operate && s === "in_progress" && order.type === "collection",
  }
}
