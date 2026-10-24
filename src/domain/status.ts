import { ArrowDownToLine, ArrowUpFromLine, DocumentScanner, Shredder } from "@/components/icons"

import type { BoxStatus, OrderType, SlotStatus } from "@/api/types"

/** Locked slots take no new boxes; the boxes already inside stay and keep counting. */
export const LOCKED_SLOT_STATUSES = ["blocked", "quarantined", "inactive"] as const
export type SlotLock = (typeof LOCKED_SLOT_STATUSES)[number]

export function isLockedSlot(status: SlotStatus): status is SlotLock {
  return (LOCKED_SLOT_STATUSES as readonly string[]).includes(status)
}

export const SLOT_LOCK_LABEL: Record<SlotLock, string> = {
  blocked: "Blocked",
  quarantined: "Quarantined",
  inactive: "Inactive",
}

// Spec §9: box statuses are semantic and separate from the accent color.
export const BOX_STATUS_META: Record<BoxStatus, { label: string; className: string }> = {
  unallocated: { label: "Unallocated", className: "border-status-neutral text-status-neutral" },
  stored: { label: "Stored", className: "border-status-stored text-status-stored" },
  reserved: { label: "Reserved", className: "border-status-reserved text-status-reserved" },
  picked: { label: "Picked", className: "border-status-reserved text-status-reserved" },
  out: { label: "Out", className: "border-status-out text-status-out" },
  pending_destruction: {
    label: "Pending destruction",
    className: "border-status-pending-destruction text-status-pending-destruction",
  },
  destroyed: { label: "Destroyed", className: "border-status-destroyed text-status-destroyed" },
  missing: { label: "Missing", className: "border-status-hold text-status-hold" },
  digitized: { label: "Digitized", className: "border-status-stored text-status-stored" },
  received: { label: "At Goods-In", className: "border-status-neutral text-status-neutral" },
  return_pending: { label: "Coming back", className: "border-status-out text-status-out" },
  quarantined: { label: "Quarantined", className: "border-status-hold text-status-hold" },
  permanently_withdrawn: { label: "Withdrawn", className: "border-status-destroyed text-status-destroyed" },
}

export const ORDER_TYPE_META: Record<OrderType, { label: string; icon: typeof ArrowDownToLine }> = {
  collection: { label: "Collection", icon: ArrowDownToLine },
  dispatch: { label: "Dispatch", icon: ArrowUpFromLine },
  destruction: { label: "Destruction", icon: Shredder },
  digitize: { label: "Digitize", icon: DocumentScanner },
}

// Plain language for the portal (spec §7: "Use plain language, not warehouse jargon").
export const PORTAL_BOX_STATUS_LABEL: Record<BoxStatus, string> = {
  unallocated: "Being processed",
  stored: "In storage",
  reserved: "In storage",
  picked: "Being prepared",
  out: "With you",
  pending_destruction: "Pending destruction",
  destroyed: "Destroyed",
  missing: "Being located",
  digitized: "Digitized",
  received: "Being processed",
  return_pending: "With you — collection booked",
  quarantined: "Being checked",
  permanently_withdrawn: "Returned to you permanently",
}

export const PORTAL_ORDER_STATUS_LABEL: Record<string, string> = {
  requested: "Requested — waiting for warehouse approval",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "Out for delivery",
  ready: "Ready",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Declined",
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  ready: "Ready",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
}
