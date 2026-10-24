"use client"

import { useMemo, useRef, useState } from "react"

import type { Slot } from "@/api/types"
import { cn } from "@/lib/utils"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { isLockedSlot } from "@/domain/status"

const STATUS_FILL: Record<Slot["status"], string> = {
  available: "bg-card border-border hover:border-status-stored/60 hover:bg-status-stored/5",
  full: "bg-status-hold/5 border-status-hold/40 hover:border-status-hold/70",
  blocked:
    "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_4px,transparent_4px,transparent_8px)] border-border text-muted-foreground",
  quarantined:
    "bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--status-hold)_18%,transparent),color-mix(in_oklab,var(--status-hold)_18%,transparent)_4px,transparent_4px,transparent_8px)] border-status-hold/50 text-muted-foreground",
  inactive: "bg-muted/60 border-dashed border-border text-muted-foreground opacity-70",
}

// Colour of the vertical gauge as the cell fills (same thresholds as the capacity bars).
const LEVEL_FILL: Record<ReturnType<typeof capacityLevel>, string> = {
  good: "bg-status-stored",
  warning: "bg-status-pending-destruction",
  critical: "bg-status-hold",
}

export interface SlotGridProps {
  rows: number
  columns: number
  slots: Slot[]
  selectedSlotId?: string
  onSelectSlot?: (slot: Slot) => void
  reservedSlotIds?: Set<string>
}

/** Spec §7/§9: rows x columns slot grid, blocked slots hatched, keyboard-navigable, proper grid role. */
export function SlotGrid({ rows, columns, slots, selectedSlotId, onSelectSlot, reservedSlotIds }: SlotGridProps) {
  const slotByPosition = useMemo(() => {
    const map = new Map<string, Slot>()
    for (const slot of slots) map.set(`${slot.row}-${slot.column}`, slot)
    return map
  }, [slots])

  const [focused, setFocused] = useState({ row: 1, column: 1 })
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  function focusCell(row: number, column: number) {
    const clampedRow = Math.min(Math.max(row, 1), rows)
    const clampedCol = Math.min(Math.max(column, 1), columns)
    setFocused({ row: clampedRow, column: clampedCol })
    cellRefs.current.get(`${clampedRow}-${clampedCol}`)?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent, row: number, column: number) {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault()
        focusCell(row - 1, column)
        break
      case "ArrowDown":
        e.preventDefault()
        focusCell(row + 1, column)
        break
      case "ArrowLeft":
        e.preventDefault()
        focusCell(row, column - 1)
        break
      case "ArrowRight":
        e.preventDefault()
        focusCell(row, column + 1)
        break
      case "Enter":
      case " ": {
        const slot = slotByPosition.get(`${row}-${column}`)
        if (slot) onSelectSlot?.(slot)
        break
      }
    }
  }

  return (
    <div
      role="grid"
      aria-label="Slot grid"
      className="inline-grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows }).map((_, rowIdx) => {
        const row = rowIdx + 1
        return (
          <div key={row} role="row" className="contents">
            {Array.from({ length: columns }).map((_, colIdx) => {
              const column = colIdx + 1
              const slot = slotByPosition.get(`${row}-${column}`)
              const isFocusable = focused.row === row && focused.column === column
              const isSelected = slot && slot.id === selectedSlotId
              const isReserved = slot && reservedSlotIds?.has(slot.id)
              const percent = slot ? capacityPercent(slot.used, slot.capacity) : 0
              const level = slot ? capacityLevel(slot.used, slot.capacity) : "good"

              return (
                <button
                  key={`${row}-${column}`}
                  ref={(el) => {
                    if (el) cellRefs.current.set(`${row}-${column}`, el)
                    else cellRefs.current.delete(`${row}-${column}`)
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={isFocusable ? 0 : -1}
                  onFocus={() => setFocused({ row, column })}
                  onKeyDown={(e) => handleKeyDown(e, row, column)}
                  onClick={() => slot && onSelectSlot?.(slot)}
                  disabled={!slot}
                  aria-label={
                    slot
                      ? `Slot ${slot.code}, ${slot.status}, ${percent}% full (${slot.used} of ${slot.capacity} cm used)`
                      : undefined
                  }
                  className={cn(
                    "focus-visible:ring-ring relative flex h-24 w-[5.5rem] items-stretch gap-2 rounded-lg border p-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    slot ? STATUS_FILL[slot.status] : "border-transparent",
                    isSelected && "ring-primary ring-2",
                  )}
                >
                  {slot && (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col justify-between">
                        <span className="text-muted-foreground text-[11px] font-medium tabular-nums">{slot.code}</span>
                        <span className="text-base leading-none font-semibold tabular-nums">
                          {isLockedSlot(slot.status) ? "—" : `${percent}%`}
                        </span>
                        <span className="text-muted-foreground text-[10px] leading-tight tabular-nums">
                          {slot.used}/{slot.capacity}
                          <br />
                          cm
                        </span>
                      </span>

                      {/* Vertical gauge: full height = the whole cell, fills from the bottom upwards. */}
                      {!isLockedSlot(slot.status) && (
                        <span aria-hidden className="bg-muted relative w-3 shrink-0 overflow-hidden rounded-full">
                          <span
                            className={cn("absolute inset-x-0 bottom-0 rounded-full transition-all", LEVEL_FILL[level])}
                            style={{ height: `${Math.min(percent, 100)}%` }}
                          />
                        </span>
                      )}

                      {isReserved && (
                        <span className="bg-status-reserved absolute top-1.5 right-1.5 size-1.5 rounded-full" />
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function SlotGridLegend() {
  const items: { label: string; className: string }[] = [
    { label: "Available", className: "bg-card border-border" },
    { label: "Full", className: "bg-status-hold/5 border-status-hold/40" },
    {
      label: "Blocked",
      className:
        "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_4px,transparent_4px,transparent_8px)] border-border",
    },
  ]

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded border", item.className)} />
          {item.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="bg-status-reserved size-1.5 rounded-full" />
        On an order
      </div>
      <div className="flex items-center gap-1.5">
        <span className="bg-status-stored h-3 w-1.5 rounded-full" />
        <span className="bg-status-pending-destruction h-3 w-1.5 rounded-full" />
        <span className="bg-status-hold h-3 w-1.5 rounded-full" />
        Gauge fills bottom to top (under 75% · 75–90% · over 90%)
      </div>
    </div>
  )
}
