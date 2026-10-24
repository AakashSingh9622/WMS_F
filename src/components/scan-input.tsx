"use client"

import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * A barcode field for keyboard-wedge scanners: the scanner "types" the code and presses Enter. The field keeps focus,
 * clears after each scan, and ignores Enter while the previous scan is still being handled. Also works by hand.
 */
export function ScanInput({
  label,
  placeholder = "Scan or type a barcode, then Enter",
  onScan,
  disabled,
  autoFocus = true,
  className,
}: {
  label: string
  placeholder?: string
  onScan: (code: string) => Promise<unknown> | void
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus()
  }, [autoFocus, disabled])

  async function submit() {
    const code = value.trim()
    if (!code || busy) return
    setBusy(true)
    try {
      await onScan(code)
    } finally {
      setValue("")
      setBusy(false)
      ref.current?.focus()
    }
  }

  return (
    <Input
      ref={ref}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      autoComplete="off"
      spellCheck={false}
      className={cn("h-12 font-mono text-base", className)}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          void submit()
        }
      }}
    />
  )
}

export interface ScanLogEntry {
  id: number
  ok: boolean
  text: string
}

/** The last scans, newest first — green for done, red for refused. */
export function ScanLog({ entries }: { entries: ScanLogEntry[] }) {
  if (entries.length === 0) return null
  return (
    <ul className="divide-y rounded-xl border text-sm" aria-live="polite">
      {entries.map((e) => (
        <li key={e.id} className={cn("px-3 py-2", e.ok ? "text-status-stored" : "text-status-hold")}>
          {e.ok ? "✓ " : "✗ "}
          {e.text}
        </li>
      ))}
    </ul>
  )
}

let logSeq = 0
/** Helper for screens: keeps the newest `max` scan results. */
export function useScanLog(max = 15) {
  const [entries, setEntries] = useState<ScanLogEntry[]>([])
  return {
    entries,
    add: (ok: boolean, text: string) => setEntries((es) => [{ id: ++logSeq, ok, text }, ...es].slice(0, max)),
  }
}
