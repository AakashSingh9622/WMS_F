import type { AuditEvent } from "@/api/types"
import { locationText } from "@/domain/location"

export interface DescribedAuditEvent {
  /** The leading word/phrase, meant to render bold (spec §5 examples all lead with a bold verb). */
  verb: string
  /** Full sentence including the verb, for CSV export / anywhere a single string is needed. */
  text: string
}

const locationLabel = (loc: AuditEvent["fromLocation"]): string => locationText(loc)

/**
 * Builds the one-sentence description of an audit event (spec §5). Staff see full detail
 * (names, locations); portal audience sees plain-language wording with no staff names, rack/slot
 * codes, or internal notes — callers should only pass client-visible events for that audience.
 */
export function describeAuditEvent(event: AuditEvent, audience: "staff" | "client" = "staff"): DescribedAuditEvent {
  if (audience === "client") return describeForClient(event)
  return describeForStaff(event)
}

function describeForStaff(event: AuditEvent): DescribedAuditEvent {
  const by = event.actor.side === "system" ? "the system" : event.actor.name
  const via = event.actor.side === "client" ? " via portal" : ""

  switch (event.type) {
    case "registered": {
      const via2 = event.orderNumber ? ` — collected on order ${event.orderNumber}` : ""
      return { verb: "Registered", text: `Registered by ${by}${via2}` }
    }
    case "label_printed":
      return { verb: "Label printed", text: `Label printed by ${by}` }
    case "allocated":
      return { verb: "Filed", text: `Filed in ${locationLabel(event.toLocation)} by ${by}` }
    case "moved": {
      const note = event.note ? ` — note: ${event.note}` : ""
      return {
        verb: "Moved",
        text: `Moved from ${locationLabel(event.fromLocation)} to ${locationLabel(event.toLocation)} by ${by}${note}`,
      }
    }
    case "details_edited": {
      const changes = (event.changes ?? []).map((c) => `${c.field}: '${c.from}' → '${c.to}'`).join(", ")
      return { verb: "Details edited", text: `Details edited by ${by}${changes ? ` — ${changes}` : ""}` }
    }
    case "added_to_order": {
      const type = event.orderNumber?.startsWith("DSP")
        ? "dispatch"
        : event.orderNumber?.startsWith("DST")
          ? "destruction"
          : event.orderNumber?.startsWith("DGT")
            ? "digitize"
            : "collection"
      return {
        verb: "Added to order",
        text: `Added to order ${event.orderNumber} (${type}) by ${event.actor.side === "client" ? "client user " : ""}${by}${via}`,
      }
    }
    case "removed_from_order":
      return { verb: "Removed from order", text: `Removed from order ${event.orderNumber} by ${by}` }
    case "picked":
      return { verb: "Picked", text: `Picked for order ${event.orderNumber} by ${by}` }
    case "dispatched": {
      const note = event.note ? ` — received by ${event.note}` : ""
      return { verb: "Dispatched", text: `Dispatched on order ${event.orderNumber}${note}` }
    }
    case "collected":
      return { verb: "Collected", text: `Collected on order ${event.orderNumber} by ${by}` }
    case "received":
      return { verb: "Received", text: `Received by ${by}${event.orderNumber ? ` on order ${event.orderNumber}` : ""}` }
    case "refiled":
      return { verb: "Refiled", text: `Refiled in ${locationLabel(event.toLocation)} by ${by}` }
    case "marked_missing":
      return { verb: "Marked missing", text: `Marked missing by ${by}${event.note ? ` — ${event.note}` : ""}` }
    case "destruction_authorised":
      return { verb: "Destruction authorised", text: `Destruction authorised by ${by} for order ${event.orderNumber}` }
    case "destroyed": {
      const method = event.note ? ` (${event.note})` : ""
      const witness = event.changes?.[0]?.to ? ` — witnessed by ${event.changes[0].to}` : ""
      return { verb: "Destroyed", text: `Destroyed${method} as per order ${event.orderNumber}${witness}` }
    }
    case "digitization_authorised":
      return {
        verb: "Digitising authorised",
        text: `Digitising authorised by ${by} for order ${event.orderNumber}${event.note ? ` — ${event.note}` : ""}`,
      }
    case "digitized":
      return { verb: "Digitized", text: `Digitized as per order ${event.orderNumber}` }
    case "hold_placed":
      return { verb: "Hold placed", text: `Hold placed by ${by}${event.note ? ` — ${event.note}` : ""}` }
    case "hold_released":
      return { verb: "Hold released", text: `Hold released by ${by}` }
    case "status_changed":
      return { verb: "Status changed", text: `Status changed by ${by}` }
    case "quarantined":
      return { verb: "Quarantined", text: `Quarantined by ${by}${event.note ? ` — ${event.note}` : ""}` }
    case "quarantine_released":
      return { verb: "Quarantine released", text: `Released from quarantine by ${by}` }
    case "relabelled": {
      const change = event.changes?.[0]
      const codes = change ? ` — ${change.from} → ${change.to}` : ""
      return {
        verb: "Re-labelled",
        text: `Re-labelled by ${by}${codes}${event.note ? ` (${event.note})` : ""}`,
      }
    }
    case "legal_hold_placed":
      return { verb: "Legal hold placed", text: `Legal hold placed by ${by}${event.note ? ` — ${event.note}` : ""}` }
    case "legal_hold_released":
      return {
        verb: "Legal hold released",
        text: `Legal hold released by ${by}${event.note ? ` — ${event.note}` : ""}`,
      }
    case "destruction_approved":
      return { verb: "Destruction approved", text: `Destruction approved by ${by} for order ${event.orderNumber}` }
    case "contents_changed":
      return { verb: "Contents updated", text: `Contents updated by ${by}${event.note ? ` — ${event.note}` : ""}` }
    case "goods_in":
      return {
        verb: "Arrived",
        text: `Arrived at ${event.toLocation?.warehouse ?? "the warehouse"} Goods-In, scanned by ${by}`,
      }
  }
}

function describeForClient(event: AuditEvent): DescribedAuditEvent {
  switch (event.type) {
    case "registered":
      return { verb: "Registered", text: "Registered with us" }
    case "received":
      return { verb: "Received", text: "Received at our warehouse" }
    case "collected":
      return { verb: "Collected", text: `Collected on your order ${event.orderNumber}` }
    case "dispatched":
      return { verb: "Dispatched", text: `Dispatched to you on order ${event.orderNumber}` }
    case "destroyed":
      return { verb: "Destroyed", text: `Destroyed as per your order ${event.orderNumber}` }
    case "added_to_order":
      return { verb: "Added to order", text: `Added to your order ${event.orderNumber}` }
    case "destruction_authorised":
      return { verb: "Authorised", text: `Destruction authorised for order ${event.orderNumber}` }
    case "digitization_authorised":
      return { verb: "Authorised", text: `Digitising authorised for order ${event.orderNumber}` }
    case "digitized":
      return { verb: "Digitized", text: `Digitized as per your order ${event.orderNumber}` }
    default:
      return { verb: "Updated", text: "Status updated" }
  }
}
