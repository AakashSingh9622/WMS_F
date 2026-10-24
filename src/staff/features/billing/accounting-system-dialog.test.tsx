import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AccountingSystemDialog } from "@/staff/features/billing/accounting-system-dialog"

// The role comes from the session (DocuSoft's strIsAdmin → staff_admin), as everywhere else in the app.
let roles: string[] = []
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: { roles } }) }))

describe("AccountingSystemDialog", () => {
  it("admin: explains how to switch and offers Settings", () => {
    roles = ["staff_admin"]
    render(<AccountingSystemDialog open onOpenChange={() => {}} />)
    expect(screen.getByText(/Your active accounting system is not Sage One/)).toBeTruthy()
    const settings = screen.getByRole("button", { name: "Go to Settings" })
    expect(settings.getAttribute("href")).toBe("https://accountancy.mydocusoft.com/account/settings.html")
    expect(screen.queryByText(/sufficient permissions/)).toBeNull()
  })

  it("not an admin: points to the administrator / support, no Settings option", () => {
    roles = ["staff_operator", "finance_manager"]
    render(<AccountingSystemDialog open onOpenChange={() => {}} />)
    expect(screen.getByText(/You do not have sufficient permissions/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "support@docusoft.co" }).getAttribute("href")).toBe(
      "mailto:support@docusoft.co",
    )
    expect(screen.queryByText("Go to Settings")).toBeNull()
  })
})
