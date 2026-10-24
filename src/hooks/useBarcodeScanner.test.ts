import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useBarcodeScanner } from "./useBarcodeScanner"

// performance.now() is what the hook reads to tell a scanner (keys ms apart) from a person typing.
let now = 0
beforeEach(() => {
  now = 1000
  vi.spyOn(performance, "now").mockImplementation(() => now)
})
afterEach(() => vi.restoreAllMocks())

function type(text: string, gapMs: number, target: EventTarget = window) {
  for (const key of [...text, "Enter"]) {
    now += gapMs
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  }
}

describe("useBarcodeScanner", () => {
  it("a fast burst ending in Enter is a scan", () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    type("BX00000123", 5)
    expect(onScan).toHaveBeenCalledWith("BX00000123")
  })

  it("ignores a person typing", () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    type("BX00000123", 150)
    expect(onScan).not.toHaveBeenCalled()
  })

  it("leaves scans into a text field to that field", () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    const input = document.createElement("input")
    document.body.appendChild(input)
    type("BX00000123", 5, input)
    expect(onScan).not.toHaveBeenCalled()
    input.remove()
  })

  it("ignores short bursts and can be switched off", () => {
    const onScan = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useBarcodeScanner(onScan, { enabled }), {
      initialProps: { enabled: true },
    })
    type("AB", 5)
    expect(onScan).not.toHaveBeenCalled()
    rerender({ enabled: false })
    type("BX00000123", 5)
    expect(onScan).not.toHaveBeenCalled()
  })
})
