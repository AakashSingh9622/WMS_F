"use client"

import { useId } from "react"

import type { Slot } from "@/api/types"
import { CM_PER_FOOT, formatVolume, type LengthUnit, type ShelfSize } from "@/domain/dimensions"
import { isLockedSlot } from "@/domain/status"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { cn } from "@/lib/utils"

/** What the drawing needs about one shelf's positions (the rack page's row model fits). */
export interface ElevationRow {
  row: number
  slots: Slot[]
}

const LEVEL_FILL = {
  good: "fill-status-stored",
  warning: "fill-status-pending-destruction",
  critical: "fill-status-hold",
} as const

// Drawing space (SVG units ≈ px at full size). The module is drawn to scale inside MAX_W × MAX_H.
const MAX_W = 500
const MAX_H = 380
const LEFT = 92 // height marks
const RIGHT = 150 // shelf names + usable heights
const TOP = 54 // total width
const BOTTOM = 58 // floor + column width / depth
const UPRIGHT = 12
const BEAM = 6

/**
 * Front view of a module (rack), drawn to scale like a racking drawing: uprights, a beam under every shelf above the
 * floor, each shelf's positions with how full they are, the height of every beam from the floor (left), each shelf's
 * usable height (right), the total width (top) and the column width / depth (bottom). Row 1 is the bottom shelf.
 * Clicking a shelf selects it. `highlightSlotId` marks one position (e.g. where a box is) with a "here" marker.
 */
export function RackElevation({
  shelves,
  columns,
  rows,
  selectedRow,
  onSelectRow,
  unit,
  highlightSlotId,
  highlightLabel = "Here",
}: {
  shelves: ShelfSize[]
  columns: number
  rows: ElevationRow[]
  selectedRow?: number
  onSelectRow?: (row: number) => void
  unit: LengthUnit
  highlightSlotId?: string
  highlightLabel?: string
}) {
  const hatchId = useId()
  const len = (cm: number) => (unit === "ft" ? `${Number((cm / CM_PER_FOOT).toFixed(1))} ft` : `${cm.toLocaleString("en-GB")} cm`)

  if (!shelves.length || columns < 1) return null

  const widthCm = Math.max(...shelves.map((s) => s.lengthCm * columns))
  const heightCm = shelves.reduce((sum, s) => sum + s.heightCm, 0)
  const scale = Math.min(MAX_W / widthCm, MAX_H / heightCm)
  const innerW = widthCm * scale
  const innerH = heightCm * scale
  const x0 = LEFT + UPRIGHT // inside face of the left upright
  const floorY = TOP + innerH
  const viewW = LEFT + UPRIGHT * 2 + innerW + RIGHT
  const viewH = TOP + innerH + BOTTOM

  // Bottom of every shelf, from the floor (cm).
  const bases: number[] = []
  let level = 0
  for (const s of shelves) {
    bases.push(level)
    level += s.heightCm
  }

  const sameLength = shelves.every((s) => s.lengthCm === shelves[0].lengthCm)
  const sameDepth = shelves.every((s) => s.depthCm === shelves[0].depthCm)
  const slotsOf = new Map(rows.map((r) => [r.row, r.slots]))

  // Where the highlighted position is (drawn last, so beams and uprights never cover it).
  const marked = (() => {
    if (!highlightSlotId) return null
    for (const [i, shelf] of shelves.entries()) {
      const slot = slotsOf.get(shelf.row)?.find((s) => s.id === highlightSlotId)
      if (!slot) continue
      const yBottom = floorY - bases[i] * scale
      const yTop = yBottom - shelf.heightCm * scale
      const cellW = shelf.lengthCm * scale
      return { x: x0 + (slot.column - 1) * cellW, y: yTop, w: cellW, h: yBottom - yTop }
    }
    return null
  })()

  // Right-hand labels must not overlap on thin shelves: only show the second line when there is room.
  const minLabelGap = 26

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="h-full max-h-[34rem] w-full select-none"
      role="img"
      aria-label={`Front view: ${shelves.length} shelves, ${len(heightCm)} high and ${len(widthCm)} wide`}
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="stroke-muted-foreground/40" strokeWidth="2" />
        </pattern>
      </defs>

      {/* total width */}
      <g className="fill-muted-foreground stroke-muted-foreground text-[11px]">
        <line x1={x0} x2={x0 + innerW} y1={TOP - 22} y2={TOP - 22} strokeWidth="1" />
        <line x1={x0} x2={x0} y1={TOP - 28} y2={TOP - 16} strokeWidth="1" />
        <line x1={x0 + innerW} x2={x0 + innerW} y1={TOP - 28} y2={TOP - 16} strokeWidth="1" />
        <text x={x0 + innerW / 2} y={TOP - 30} textAnchor="middle" stroke="none" className="fill-foreground font-medium">
          {len(widthCm)} total width
        </text>
      </g>

      {/* floor */}
      <rect x={LEFT - 16} y={floorY} width={innerW + UPRIGHT * 2 + 32} height={12} className="fill-muted stroke-border" />
      <text x={x0 + innerW / 2} y={floorY + 9} textAnchor="middle" className="fill-muted-foreground text-[8px] tracking-wider">
        FLOOR
      </text>

      {/* shelves */}
      {shelves.map((shelf, i) => {
        const yBottom = floorY - bases[i] * scale
        const yTop = yBottom - shelf.heightCm * scale
        const beamTop = i > 0 ? yBottom - BEAM / 2 : yBottom
        const cellW = shelf.lengthCm * scale
        const cellTop = yTop + (i < shelves.length - 1 ? BEAM / 2 : 0) + 2
        const cellBottom = beamTop - 1
        const cellH = Math.max(cellBottom - cellTop, 1)
        const slots = slotsOf.get(shelf.row) ?? []
        const used = slots.reduce((s, x) => s + x.used, 0)
        const capacity = slots.reduce((s, x) => s + x.capacity, 0)
        const selected = shelf.row === selectedRow
        const name = `Shelf ${shelf.row}: ${columns} position${columns === 1 ? "" : "s"} of ${len(shelf.lengthCm)} × ${len(
          shelf.depthCm,
        )} × ${len(shelf.heightCm)} (L × D × H), ${capacityPercent(used, capacity)}% full (${formatVolume(used)} of ${formatVolume(capacity)})`
        const select = () => onSelectRow?.(shelf.row)
        return (
          <g
            key={shelf.row}
            role={onSelectRow ? "button" : undefined}
            tabIndex={onSelectRow ? 0 : undefined}
            aria-pressed={onSelectRow ? selected : undefined}
            aria-label={name}
            onClick={select}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                select()
              }
            }}
            className={cn("outline-none", onSelectRow && "cursor-pointer [&:focus-visible>rect.sel]:stroke-ring")}
          >
            <title>{name}</title>
            {/* hit area + selection outline */}
            <rect
              className={cn("sel fill-transparent", selected ? "stroke-primary" : "stroke-transparent hover:stroke-primary/40")}
              x={x0 + 1}
              y={yTop + 1}
              width={innerW - 2}
              height={Math.max(yBottom - yTop - 2, 1)}
              strokeWidth={2}
              rx={3}
            />
            {Array.from({ length: columns }, (_, c) => {
              const slot = slots.find((s) => s.column === c + 1)
              const x = x0 + c * cellW + 2
              const w = Math.max(cellW - 4, 1)
              const locked = slot ? isLockedSlot(slot.status) : false
              const pct = slot ? Math.min(capacityPercent(slot.used, slot.capacity), 100) : 0
              const fillH = (cellH * pct) / 100
              return (
                <g key={c} className="pointer-events-none">
                  <rect x={x} y={cellTop} width={w} height={cellH} rx={2} className={cn(selected ? "fill-primary/10 stroke-primary/40" : "fill-card stroke-border")} strokeDasharray="3 2" />
                  {locked && <rect x={x} y={cellTop} width={w} height={cellH} rx={2} fill={`url(#${hatchId})`} />}
                  {!locked && fillH > 0 && slot && (
                    <rect
                      x={x + 1}
                      y={cellBottom - fillH}
                      width={Math.max(w - 2, 1)}
                      height={fillH}
                      rx={1.5}
                      className={cn(LEVEL_FILL[capacityLevel(slot.used, slot.capacity)], "opacity-80")}
                    />
                  )}
                </g>
              )
            })}
            {selected && (
              <rect
                x={x0 + 1}
                y={yTop + 1}
                width={innerW - 2}
                height={Math.max(yBottom - yTop - 2, 1)}
                rx={3}
                strokeWidth={2.5}
                className="stroke-primary pointer-events-none fill-none"
              />
            )}
            {/* beam this shelf stands on (shelf 1 stands on the floor) */}
            {i > 0 && (
              <rect x={x0} y={yBottom - BEAM / 2} width={innerW} height={BEAM} rx={1} className="pointer-events-none fill-orange-500" />
            )}
          </g>
        )
      })}

      {/* uprights (drawn over the beam ends) */}
      {[LEFT, x0 + innerW].map((x) => (
        <rect key={x} x={x} y={TOP - 4} width={UPRIGHT} height={innerH + 4} rx={1.5} className="fill-orange-600" />
      ))}

      {marked && (
        <g className="pointer-events-none">
          <rect
            x={marked.x + 0.5}
            y={marked.y + 0.5}
            width={Math.max(marked.w - 1, 2)}
            height={Math.max(marked.h - 1, 2)}
            rx={3}
            strokeWidth={3}
            className="fill-[#b93c2e]/10 stroke-[#b93c2e]"
          />
          {/* tag in the middle of the position (above it would clash with the width line on the top shelf) */}
          <g transform={`translate(${marked.x + marked.w / 2}, ${marked.y + marked.h / 2})`}>
            <rect x={-30} y={-9} width={60} height={18} rx={9} className="fill-[#b93c2e]" />
            <text y={3.5} textAnchor="middle" className="fill-white text-[10px] font-semibold">
              {highlightLabel}
            </text>
          </g>
        </g>
      )}

      {/* left: height of every level from the floor */}
      <g className="fill-muted-foreground stroke-muted-foreground text-[11px]">
        {[...bases, heightCm].map((cm, i) => {
          const y = floorY - cm * scale
          return (
            <g key={i}>
              <line x1={LEFT - 6} x2={LEFT} y1={y} y2={y} strokeWidth="1" />
              <text x={LEFT - 10} y={y + 4} textAnchor="end" stroke="none" className="tabular-nums">
                {len(cm)}
              </text>
            </g>
          )
        })}
      </g>

      {/* right: each shelf's usable height */}
      <g className="text-[11px]">
        {shelves.map((shelf, i) => {
          const yBottom = floorY - bases[i] * scale
          const yTop = yBottom - shelf.heightCm * scale
          const mid = (yTop + yBottom) / 2
          const x = x0 + innerW + UPRIGHT + 14
          const tall = yBottom - yTop >= minLabelGap
          return (
            <g key={shelf.row} className="stroke-muted-foreground fill-muted-foreground">
              <line x1={x} x2={x} y1={yTop + 2} y2={yBottom - 2} strokeWidth="1" />
              <line x1={x - 4} x2={x + 4} y1={yTop + 2} y2={yTop + 2} strokeWidth="1" />
              <line x1={x - 4} x2={x + 4} y1={yBottom - 2} y2={yBottom - 2} strokeWidth="1" />
              <text
                x={x + 10}
                y={tall ? mid - 2 : mid + 4}
                stroke="none"
                className={cn("font-medium", shelf.row === selectedRow ? "fill-primary font-semibold" : "fill-foreground")}
              >
                Shelf {shelf.row}
                {!tall && <tspan className="fill-muted-foreground font-normal"> · {len(shelf.heightCm)}</tspan>}
              </text>
              {tall && (
                <text x={x + 10} y={mid + 12} stroke="none" className="tabular-nums">
                  {len(shelf.heightCm)} high
                </text>
              )}
            </g>
          )
        })}
      </g>

      {/* bottom: column width and depth */}
      <text x={x0 + innerW / 2} y={floorY + 32} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
        {sameLength ? `${columns} × ${len(shelves[0].lengthCm)} columns` : `${columns} columns per shelf (widths vary — hover a shelf)`}
      </text>
      <text x={x0 + innerW / 2} y={floorY + 48} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {sameDepth ? `${len(shelves[0].depthCm)} deep` : "Depth varies by shelf — hover a shelf"}
      </text>
    </svg>
  )
}
