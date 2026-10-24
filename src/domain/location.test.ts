import { describe, expect, it } from "vitest"

import { locationSegments, locationText, shelfCode } from "./location"

describe("locationSegments", () => {
  it("shows zone, aisle, rack, shelf and position for a new snapshot", () => {
    expect(
      locationSegments({ warehouse: "WH1", zone: "A", aisle: "3", rack: "B04", slot: "3-2", shelf: 3, position: 2 }),
    ).toEqual(["WH1", "Zone A", "Aisle 3", "Rack B04", "Shelf 3 · Position 2"])
  })

  it("skips zone and aisle when the rack has none", () => {
    expect(locationSegments({ warehouse: "WH1", rack: "B04", slot: "3-2", shelf: 3, position: 2 })).toEqual([
      "WH1",
      "Rack B04",
      "Shelf 3 · Position 2",
    ])
  })

  it("reads shelf and position from an older snapshot's slot code", () => {
    expect(locationText({ warehouse: "WH1", rack: "B-04", slot: "3-2" })).toBe("WH1 › Rack B-04 › Shelf 3 · Position 2")
  })

  it("shows Goods-In without rack or slot", () => {
    expect(locationText({ warehouse: "WH1", rack: "Goods-In", slot: "—" })).toBe("WH1 › Goods-In")
  })

  it("falls back to the slot code when it isn't row-column", () => {
    expect(locationSegments({ warehouse: "WH1", rack: "B04", slot: "X" }).at(-1)).toBe("Slot X")
  })

  it("is empty for no location", () => {
    expect(locationText(undefined)).toBe("")
  })
})

describe("shelfCode", () => {
  it("builds the code people type", () => {
    expect(shelfCode("B04", 3)).toBe("B04-3")
    expect(shelfCode("B04", 3, 2)).toBe("B04-3-2")
  })
})
