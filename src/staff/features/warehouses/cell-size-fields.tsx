"use client"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  checkDimensions,
  formatVolume,
  volumeCm3,
  type DimensionCheck,
  type LengthUnit,
} from "@/domain/dimensions"

export interface CellSize {
  length: string
  height: string
  depth: string
}

export const EMPTY_CELL_SIZE: CellSize = { length: "", height: "", depth: "" }

/** Checks the three typed values (all in `unit`); `volume` is the capacity of one cell in cm³ when they are valid. */
export function checkCellSize(size: CellSize, unit: LengthUnit): DimensionCheck & { volume?: number } {
  const check = checkDimensions(size, unit)
  return check.ok ? { ...check, volume: volumeCm3(check.length, check.height, check.depth) } : check
}

/**
 * Length, height and depth of ONE rack cell (a column of a shelf), one unit for all three. A cell is box-shaped, so its
 * capacity is its volume. `cellCount` (optional) adds the module's total to the summary line.
 */
export function CellSizeFields({
  idPrefix,
  size,
  unit,
  onSizeChange,
  onUnitChange,
  cellCount,
  changedHint,
}: {
  idPrefix: string
  size: CellSize
  unit: LengthUnit
  onSizeChange: (size: CellSize) => void
  onUnitChange: (unit: LengthUnit) => void
  cellCount?: number
  changedHint?: React.ReactNode
}) {
  const check = checkCellSize(size, unit)
  const set = (key: keyof CellSize) => (e: React.ChangeEvent<HTMLInputElement>) => onSizeChange({ ...size, [key]: e.target.value })
  const touched = Boolean(size.length || size.height || size.depth)

  // Entered in the order staff measure a shelf: length, depth, height.
  const parts: { key: keyof CellSize; short: string; label: string; example: string }[] = [
    { key: "length", short: "Length", label: "Length of one column", example: "4" },
    { key: "depth", short: "Depth", label: "Depth (width) of one column", example: "1.5" },
    { key: "height", short: "Height", label: "Height of one column", example: "2" },
  ]

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-length`}>Dimensions</FieldLabel>
        <div className="flex items-start gap-1.5">
          {parts.map((part, i) => (
            <div key={part.key} className="flex min-w-0 flex-1 items-start gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-muted-foreground pt-2 text-sm">
                  ×
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  id={`${idPrefix}-${part.key}`}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  aria-label={part.label}
                  value={size[part.key]}
                  onChange={set(part.key)}
                  placeholder={part.example}
                />
                <span className="text-muted-foreground block text-center text-[11px]">{part.short}</span>
              </div>
            </div>
          ))}
          <Select value={unit} onValueChange={(v) => onUnitChange((v as LengthUnit) ?? "ft")}>
            <SelectTrigger className="w-20 shrink-0" aria-label="Unit for length, depth and height">
              <SelectValue getLabel={(v) => (v === "cm" ? "cm" : "feet")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cm">cm</SelectItem>
              <SelectItem value="ft">feet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Field>
      <p className="text-muted-foreground -mt-2 text-xs">
        Size of one column (each row × column cell is one storage location). Its capacity is its volume — length ×
        depth × height, converted to centimetres when saved.
        {check.ok && (
          <>
            {" "}
            <span className="text-foreground tabular-nums">
              = {check.length} × {check.depth} × {check.height} cm = {formatVolume(check.volume ?? 0)} per cell
              {cellCount ? ` · ${cellCount} cells · ${formatVolume((check.volume ?? 0) * cellCount)} total` : ""}
            </span>
          </>
        )}
        {!check.ok && touched && (
          <>
            {" "}
            <span className="text-destructive">{check.error}.</span>
          </>
        )}
        {changedHint}
      </p>
    </>
  )
}
