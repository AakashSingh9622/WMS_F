import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
vi.mock("@/api/settings", () => ({
  useBoxLengths: () => ({ standard: 40, large: 80 }),
  useBoxSizes: () => [
    { code: "standard", name: "Standard", lengthCm: 40, active: true, builtIn: true, boxCount: 0 },
    { code: "large", name: "Large", lengthCm: 80, active: true, builtIn: true, boxCount: 0 },
  ],
  useBoxSizeName: () => (code: string) => (code === "large" ? "Large" : "Standard"),
}))
const correctBatch = vi.fn()
vi.mock("@/api/boxes", () => ({
  useCreateBoxesBatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCorrectRegisteredBoxes: () => ({ mutateAsync: correctBatch, isPending: false }),
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

describe("RegisterBoxesScreen back and forth", () => {
  const box = (n: number) => ({
    id: `b${n}`,
    boxNumber: `BX0000000${n}`,
    barcode: `BX0000000${n}`,
    clientId: "C1",
    clientName: "CR PROPOSALS 0003",
    description: "Tax",
    filingDateFrom: "2020-01-01",
    size: "standard",
    status: "unallocated",
  })

  beforeEach(() => {
    sessionStorage.clear()
    search = "step=details"
    order = undefined
  })

  it("going back to Details after registering shows the form filled in; saving fixes the batch, not a new one", async () => {
    sessionStorage.setItem(
      "register-boxes-session",
      JSON.stringify({ boxes: [box(1), box(2)], placed: {}, printed: true, finished: false }),
    )
    correctBatch.mockResolvedValue([
      { ...box(1), description: "Board minutes" },
      { ...box(2), description: "Board minutes" },
    ])
    render(<RegisterBoxesScreen />)
    await waitFor(() => expect(screen.getByText("BX00000001 – BX00000002")).toBeTruthy())
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("2")
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement
    expect(description.value).toBe("Tax")
    expect(screen.getByRole("button", { name: "No changes" }).hasAttribute("disabled")).toBe(true)
    fireEvent.change(description, { target: { value: "Board minutes" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(correctBatch).toHaveBeenCalledWith({ boxIds: ["b1", "b2"], description: "Board minutes" }),
    )
    expect(screen.getByRole("button", { name: /Print labels/ }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: /File boxes/ }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: /Done/ }).hasAttribute("disabled")).toBe(true) // not finished yet
  })

  it("before registering only Details is open", () => {
    render(<RegisterBoxesScreen />)
    expect(screen.getByRole("button", { name: /Print labels/ }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("Quantity")).toBeTruthy()
  })
})
