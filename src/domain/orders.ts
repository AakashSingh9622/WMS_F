import type { Box, Order, OrderStatus, OrderType } from "@/api/types"
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
export function getOrderActions(order: Order): OrderActions {
  const s = order.status
  const next = (to: OrderStatus) => canTransition(s, to)

  return {
    canApprove: next("approved"),
    canReject: next("rejected"),
    canSchedule: next("scheduled"),
    canStart: next("in_progress"),
    canCancel: next("cancelled"),
    canDispatch: s === "in_progress" && order.type === "dispatch",
    canAuthoriseDestruction:
      order.type === "destruction" && !order.destruction && (s === "approved" || s === "scheduled"),
    canAuthoriseDigitization:
      order.type === "digitize" && !order.digitization && (s === "approved" || s === "scheduled"),
    canFixBoxScan: order.type === "digitize" && (s === "scheduled" || s === "in_progress"),
    canDestroy: s === "in_progress" && order.type === "destruction" && !!order.destruction,
    canComplete: s === "in_progress" && order.type === "collection",
  }
}
