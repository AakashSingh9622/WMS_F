import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RegisterBoxesScreen } from "@/staff/features/boxes/register/register-boxes-screen"

// The wizard opened from a collection order ("Register new boxes for this order") must start with the quantity of
// boxes that order still expects.

let search = "orderId=ord-1&clientId=C1"
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

let order: unknown
let registeredTotal: number | undefined
vi.mock("@/api/orders", () => ({ useOrder: () => ({ data: order }) }))
vi.mock("@/api/audit", () => ({
  useAuditSearch: (_input: unknown, options?: { enabled?: boolean }) => ({
    data:
      options?.enabled === false || registeredTotal === undefined ? undefined : { items: [], total: registeredTotal },
  }),
}))
vi.mock("@/api/settings", () => ({ useBoxLengths: () => ({ standard: 40, large: 80 }) }))
vi.mock("@/api/boxes", () => ({
  useCreateBoxesBatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/api/records", () => ({ useRetentionRules: () => ({ data: [] }) }))
vi.mock("@/store/docusoftApi", () => ({
  useGetClientsWithDetailsQuery: () => ({ data: [{ ClientId: "C1", Client: "CR PROPOSALS 0003" }] }),
}))

const collectionOrder = (expectedNewBoxes: number) => ({
  id: "ord-1",
  orderNumber: "COL-000007",
  type: "collection",
  collection: { expectedNewBoxes },
})

describe("RegisterBoxesScreen quantity default", () => {
  beforeEach(() => {
    sessionStorage.clear()
    search = "orderId=ord-1&clientId=C1"
    registeredTotal = 0
  })

  it("starts at the number of expected new boxes", async () => {
    order = collectionOrder(3)
    render(<RegisterBoxesScreen />)
    await waitFor(() => expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("3"))
    expect(screen.getByText(/3 new boxes expected on this order · 0 already registered/)).toBeTruthy()
  })

  it("only asks for what is still missing", async () => {
    order = collectionOrder(5)
    registeredTotal = 2
    render(<RegisterBoxesScreen />)
    await waitFor(() => expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("3"))
  })

  it("leaves the default alone when nothing is expected / no order is linked", async () => {
    search = ""
    order = undefined
    render(<RegisterBoxesScreen />)
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("1")
  })
})
