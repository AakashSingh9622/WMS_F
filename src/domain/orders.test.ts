import { describe, expect, it } from "vitest"

import { getOrderActions, isBillingSettled } from "@/domain/orders"
import type { Order, OrderBilling } from "@/api/types"

const order = (status: Order["status"], billing?: OrderBilling): Order =>
  ({
    id: "o1",
    orderNumber: "DSP-000001",
    type: "dispatch",
    status,
    clientId: "C1",
    clientName: "Client One",
    requestedBy: { id: "u", name: "U", side: "staff" },
    requestedVia: "staff",
    createdAt: "2026-10-01",
    boxCount: 1,
    lineSummary: {},
    billing,
  }) as Order

const admin = ["staff_admin"] as const
const operator = ["staff_operator"] as const

describe("billing stage", () => {
  it("approving a request moves it to billing", () => {
    expect(getOrderActions(order("requested"), admin).canApprove).toBe(true)
  })

  it.each(["awaiting_invoice", "invoice_draft", "awaiting_payment", "awaiting_acknowledgement"] as const)(
    "%s: Schedule stays locked",
    (status) => {
      const a = getOrderActions(order("billing", { status }), admin)
      expect(a.canSchedule).toBe(false)
      expect(a.waitingForPayment).toBe(true)
    },
  )

  it.each(["paid", "acknowledged", "waived"] as const)("%s: can be scheduled", (status) => {
    const a = getOrderActions(order("billing", { status }), operator)
    expect(a.canSchedule).toBe(true)
    expect(a.waitingForPayment).toBe(false)
  })

  it("an old 'approved' order still schedules", () => {
    expect(isBillingSettled(order("approved"))).toBe(true)
    expect(getOrderActions(order("approved"), operator).canSchedule).toBe(true)
  })

  it("only billing.manage raises the invoice / records payment", () => {
    expect(
      getOrderActions(order("billing", { status: "awaiting_invoice" }), ["finance_manager"]).canManageBilling,
    ).toBe(true)
    expect(getOrderActions(order("billing", { status: "awaiting_invoice" }), operator).canManageBilling).toBe(false)
    expect(getOrderActions(order("scheduled"), admin).canManageBilling).toBe(false)
  })
})
