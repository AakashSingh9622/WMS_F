import { describe, expect, it } from "vitest"

import { describeAuditEvent } from "@/domain/audit"
import type { AuditEvent, AuditEventType } from "@/api/types"

const staffActor = { id: "u-admin", name: "Ahmed Khan", side: "staff" as const }
const clientActor = { id: "c-1-user", name: "John Smith", side: "client" as const }

function baseEvent(type: AuditEventType, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    boxId: "box-1",
    boxNumber: "BX00000001",
    clientId: "client-1",
    type,
    at: "2026-01-01T10:00:00.000Z",
    actor: staffActor,
    visibleToClient: false,
    ...overrides,
  }
}

describe("describeAuditEvent (staff audience)", () => {
  it("registered — plain", () => {
    expect(describeAuditEvent(baseEvent("registered")).text).toBe("Registered by Ahmed Khan")
  })

  it("registered — with an order", () => {
    const text = describeAuditEvent(baseEvent("registered", { orderNumber: "COL-000118" })).text
    expect(text).toBe("Registered by Ahmed Khan — collected on order COL-000118")
  })

  it("label_printed", () => {
    expect(describeAuditEvent(baseEvent("label_printed")).text).toBe("Label printed by Ahmed Khan")
  })

  it("allocated", () => {
    const text = describeAuditEvent(
      baseEvent("allocated", { toLocation: { warehouse: "WH1", rack: "B-04", slot: "3-2" } }),
    ).text
    expect(text).toBe("Filed in WH1 › Rack B-04 › Slot 3-2 by Ahmed Khan")
  })

  it("moved — with a note", () => {
    const text = describeAuditEvent(
      baseEvent("moved", {
        actor: { id: "u-2", name: "Sara Ali", side: "staff" },
        fromLocation: { warehouse: "WH1", rack: "B-04", slot: "3-2" },
        toLocation: { warehouse: "WH1", rack: "C-01", slot: "1-4" },
        note: "rack B-04 maintenance",
      }),
    ).text
    expect(text).toBe("Moved from WH1 › Rack B-04 › Slot 3-2 to WH1 › Rack C-01 › Slot 1-4 by Sara Ali — note: rack B-04 maintenance")
  })

  it("details_edited — with changes", () => {
    const text = describeAuditEvent(
      baseEvent("details_edited", {
        actor: { id: "u-2", name: "Sara Ali", side: "staff" },
        changes: [{ field: "description", from: "Invoices 2019", to: "Invoices 2019 Q1–Q2" }],
      }),
    ).text
    expect(text).toBe("Details edited by Sara Ali — description: 'Invoices 2019' → 'Invoices 2019 Q1–Q2'")
  })

  it("added_to_order — via portal", () => {
    const text = describeAuditEvent(
      baseEvent("added_to_order", { actor: clientActor, orderNumber: "DSP-000207" }),
    ).text
    expect(text).toBe("Added to order DSP-000207 (dispatch) by client user John Smith via portal")
  })

  it("removed_from_order", () => {
    expect(describeAuditEvent(baseEvent("removed_from_order", { orderNumber: "DSP-000207" })).text).toBe(
      "Removed from order DSP-000207 by Ahmed Khan",
    )
  })

  it("picked", () => {
    expect(describeAuditEvent(baseEvent("picked", { orderNumber: "DSP-000207" })).text).toBe(
      "Picked for order DSP-000207 by Ahmed Khan",
    )
  })

  it("dispatched — with recipient note", () => {
    const text = describeAuditEvent(baseEvent("dispatched", { orderNumber: "DSP-000207", note: "M. Jones" })).text
    expect(text).toBe("Dispatched on order DSP-000207 — received by M. Jones")
  })

  it("collected", () => {
    expect(describeAuditEvent(baseEvent("collected", { orderNumber: "COL-000118" })).text).toBe(
      "Collected on order COL-000118 by Ahmed Khan",
    )
  })

  it("received", () => {
    expect(describeAuditEvent(baseEvent("received")).text).toBe("Received by Ahmed Khan")
  })

  it("refiled", () => {
    const text = describeAuditEvent(
      baseEvent("refiled", { toLocation: { warehouse: "WH1", rack: "B-04", slot: "3-2" } }),
    ).text
    expect(text).toBe("Refiled in WH1 › Rack B-04 › Slot 3-2 by Ahmed Khan")
  })

  it("marked_missing — with a note", () => {
    const text = describeAuditEvent(baseEvent("marked_missing", { note: "Not in slot during audit" })).text
    expect(text).toBe("Marked missing by Ahmed Khan — Not in slot during audit")
  })

  it("destruction_authorised", () => {
    expect(describeAuditEvent(baseEvent("destruction_authorised", { orderNumber: "DST-000123" })).text).toBe(
      "Destruction authorised by Ahmed Khan for order DST-000123",
    )
  })

  it("destroyed — with method and witness", () => {
    const text = describeAuditEvent(
      baseEvent("destroyed", { orderNumber: "DST-000123", note: "shred", changes: [{ field: "witness", to: "R. Patel" }] }),
    ).text
    expect(text).toBe("Destroyed (shred) as per order DST-000123 — witnessed by R. Patel")
  })

  it("hold_placed", () => {
    expect(describeAuditEvent(baseEvent("hold_placed", { note: "Litigation hold" })).text).toBe(
      "Hold placed by Ahmed Khan — Litigation hold",
    )
  })

  it("hold_released", () => {
    expect(describeAuditEvent(baseEvent("hold_released")).text).toBe("Hold released by Ahmed Khan")
  })

  it("quarantined", () => {
    expect(describeAuditEvent(baseEvent("quarantined", { note: "Water damage" })).text).toBe(
      "Quarantined by Ahmed Khan — Water damage",
    )
  })

  it("quarantine_released", () => {
    expect(describeAuditEvent(baseEvent("quarantine_released")).text).toBe("Released from quarantine by Ahmed Khan")
  })

  it("relabelled", () => {
    expect(
      describeAuditEvent(
        baseEvent("relabelled", { changes: [{ field: "barcode", from: "BX00000002", to: "BX00000009" }], note: "Torn" }),
      ).text,
    ).toBe("Re-labelled by Ahmed Khan — BX00000002 → BX00000009 (Torn)")
  })

  it("goods_in", () => {
    expect(
      describeAuditEvent(baseEvent("goods_in", { toLocation: { warehouse: "WH1", rack: "Goods-In", slot: "—" } })).text,
    ).toBe("Arrived at WH1 Goods-In, scanned by Ahmed Khan")
  })

  it("legal_hold_placed", () => {
    expect(describeAuditEvent(baseEvent("legal_hold_placed", { note: "High Court: Case 123" })).text).toBe(
      "Legal hold placed by Ahmed Khan — High Court: Case 123",
    )
  })

  it("destruction_approved", () => {
    expect(describeAuditEvent(baseEvent("destruction_approved", { orderNumber: "DST-000001" })).text).toBe(
      "Destruction approved by Ahmed Khan for order DST-000001",
    )
  })

  it("contents_changed", () => {
    expect(describeAuditEvent(baseEvent("contents_changed", { note: "Added: VAT returns" })).text).toBe(
      "Contents updated by Ahmed Khan — Added: VAT returns",
    )
  })

  it("status_changed", () => {
    expect(describeAuditEvent(baseEvent("status_changed")).text).toBe("Status changed by Ahmed Khan")
  })
})

describe("describeAuditEvent (client audience)", () => {
  it("never mentions staff names, rack/slot codes, or internal notes", () => {
    const text = describeAuditEvent(
      baseEvent("moved", {
        fromLocation: { warehouse: "WH1", rack: "B-04", slot: "3-2" },
        toLocation: { warehouse: "WH1", rack: "C-01", slot: "1-4" },
        note: "internal note",
        visibleToClient: true,
      }),
      "client",
    ).text
    expect(text).not.toMatch(/Ahmed|B-04|3-2|internal note/)
  })

  it("received reads as plain language", () => {
    expect(describeAuditEvent(baseEvent("received", { visibleToClient: true }), "client").text).toBe(
      "Received at our warehouse",
    )
  })

  it("dispatched reads as plain language", () => {
    expect(
      describeAuditEvent(baseEvent("dispatched", { orderNumber: "DSP-000207", visibleToClient: true }), "client").text,
    ).toBe("Dispatched to you on order DSP-000207")
  })

  it("destroyed reads as plain language", () => {
    expect(
      describeAuditEvent(baseEvent("destroyed", { orderNumber: "DST-000123", visibleToClient: true }), "client").text,
    ).toBe("Destroyed as per your order DST-000123")
  })
})
