import { ArrowDownToLine, ArrowUpFromLine, DocumentScanner, Shredder } from "@/components/icons"

import type { BoxStatus, OrderType } from "@/api/types"

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
}

export const PORTAL_ORDER_STATUS_LABEL: Record<string, string> = {
  requested: "Requested — waiting for warehouse approval",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Declined",
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
}
