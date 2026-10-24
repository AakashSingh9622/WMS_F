import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

describe("Select", () => {
  it("shows the chosen option's name, never its id", () => {
    render(
      <Select value="aa4bc886">
        <SelectTrigger className="w-56" aria-label="Warehouse">
          <SelectValue placeholder="Warehouse" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="aa4bc886">W3 — Records store</SelectItem>
          <SelectItem value="1262d503">W4 — Overflow</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(screen.getByText("W3 — Records store")).toBeTruthy()
    expect(screen.queryByText("aa4bc886")).toBeNull()
  })

  it("uses getLabel while the options haven't loaded yet", () => {
    render(
      <Select value="z1">
        <SelectTrigger aria-label="Zone">
          <SelectValue getLabel={() => "Zone A"} />
        </SelectTrigger>
        <SelectContent />
      </Select>,
    )
    expect(screen.getByText("Zone A")).toBeTruthy()
  })
})
