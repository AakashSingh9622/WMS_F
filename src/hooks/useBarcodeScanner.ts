"use client"

import { useEffect, useRef } from "react"

// A handheld (USB / Bluetooth) scanner "types" the barcode very fast and presses Enter. People don't type that fast,
// so a burst of keys a few ms apart, ending in Enter, is a scan.
const MAX_GAP_MS = 50
const MIN_LENGTH = 6

/**
 * Calls `onScan(code)` when a scanner fires anywhere on the page — except while the focus is in a text field, where the
 * field gets the scan itself (the put-away / pick screens have their own scan inputs).
 */
export function useBarcodeScanner(onScan: (code: string) => void, { enabled = true }: { enabled?: boolean } = {}) {
  const latest = useRef(onScan)
  useEffect(() => {
    latest.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return
    let buffer = ""
    let last = 0
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        buffer = ""
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const now = performance.now()
      if (now - last > MAX_GAP_MS) buffer = "" // a pause: a person typing, start again
      last = now
      if (e.key === "Enter") {
        if (buffer.length >= MIN_LENGTH) {
          e.preventDefault()
          latest.current(buffer)
        }
        buffer = ""
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
