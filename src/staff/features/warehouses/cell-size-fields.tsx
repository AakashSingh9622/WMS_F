"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ShelfSizeInput } from "@/api/warehouses"
import {
  CM_PER_FOOT,
  checkDimensions,
  formatVolume,
  volumeCm3,
  type DimensionCheck,
  type LengthUnit,
  type ShelfSize,
} from "@/domain/dimensions"

/** One size as typed (strings, so a field can be empty while typing), all three in the form's unit. */
export interface CellSize {
  length: string
  height: string
  depth: string
}

export const EMPTY_CELL_SIZE: CellSize = { length: "", height: "", depth: "" }

/**
 * The size of a module's columns: one size for every shelf, or — "the size of each shelf varies" — one per shelf
 * (`shelves[0]` = shelf 1, the bottom one).
 */
export interface ModuleSize {
  varies: boolean
  common: CellSize
  shelves: CellSize[]
}

export const EMPTY_MODULE_SIZE: ModuleSize = { varies: false, common: EMPTY_CELL_SIZE, shelves: [] }

/** Checks the three typed values (all in `unit`); `volume` is the capacity of one cell in cm³ when they are valid. */
export function checkCellSize(size: CellSize, unit: LengthUnit): DimensionCheck & { volume?: number } {
  const check = checkDimensions(size, unit)
  return check.ok ? { ...check, volume: volumeCm3(check.length, check.height, check.depth) } : check
}

/** `list` grown / shrunk to `count` shelves; new shelves copy the top one (or `fallback` when there is none). */
function resize(list: CellSize[], count: number, fallback: CellSize): CellSize[] {
  if (count <= 0) return []
  if (list.length >= count) return list.slice(0, count)
  const extra = list.length ? list[list.length - 1] : fallback
  return [...list, ...Array<CellSize>(count - list.length).fill(extra)]
}

/** The size with its per-shelf list matching `shelfCount` (the number of shelves can change while the form is open). */
export function fitModuleSize(size: ModuleSize, shelfCount: number): ModuleSize {
  return size.varies ? { ...size, shelves: resize(size.shelves, shelfCount, size.common) } : size
}

type ModuleCheck = { ok: true; volumes: number[] } | { ok: false; error: string }

/** Every shelf valid? `volumes` = one cell's volume per shelf, bottom first. */
export function checkModuleSize(size: ModuleSize, unit: LengthUnit, shelfCount: number): ModuleCheck {
  if (!size.varies) {
    const c = checkCellSize(size.common, unit)
    return c.ok ? { ok: true, volumes: Array<number>(Math.max(shelfCount, 0)).fill(c.volume ?? 0) } : c
  }
  const fitted = fitModuleSize(size, shelfCount)
  if (fitted.shelves.length < 1) return { ok: false, error: "Enter the number of shelves first" }
  const volumes: number[] = []
  for (const [i, shelf] of fitted.shelves.entries()) {
    const c = checkCellSize(shelf, unit)
    if (!c.ok) return { ok: false, error: `Shelf ${i + 1}: ${c.error.toLowerCase()}` }
    volumes.push(c.volume ?? 0)
  }
  return { ok: true, volumes }
}

/** The request fields for a module size: one cell size, or one size per shelf (bottom first). */
export function moduleSizeRequest(
  size: ModuleSize,
  shelfCount: number,
): { cellLength: number; cellHeight: number; cellDepth: number } | { shelves: ShelfSizeInput[] } {
  const num = (s: CellSize): ShelfSizeInput => ({ length: Number(s.length), height: Number(s.height), depth: Number(s.depth) })
  if (size.varies) return { shelves: fitModuleSize(size, shelfCount).shelves.map(num) }
  const c = num(size.common)
  return { cellLength: c.length, cellHeight: c.height, cellDepth: c.depth }
}

/** A module's current sizes as form values, in cm. */
export function moduleSizeFromShelves(
  shelves: ShelfSize[],
  cell: Pick<ShelfSize, "lengthCm" | "heightCm" | "depthCm">,
  varies: boolean,
): ModuleSize {
  const text = (s: Pick<ShelfSize, "lengthCm" | "heightCm" | "depthCm">): CellSize => ({
    length: String(s.lengthCm),
    height: String(s.heightCm),
    depth: String(s.depthCm),
  })
  return { varies, common: text(cell), shelves: varies ? shelves.map(text) : [] }
}

/** The same physical size written in another unit (feet to 2 decimals); left as typed when it isn't valid yet. */
function convert(size: CellSize, from: LengthUnit, to: LengthUnit): CellSize {
  const c = checkDimensions(size, from)
  if (!c.ok || from === to) return size
  const write = (cm: number) => String(to === "ft" ? Number((cm / CM_PER_FOOT).toFixed(2)) : cm)
  return { length: write(c.length), height: write(c.height), depth: write(c.depth) }
}

const PARTS: { key: keyof CellSize; short: string; long: string; example: string }[] = [
  { key: "length", short: "Length", long: "length", example: "4" },
  { key: "depth", short: "Depth", long: "depth (width)", example: "1.5" },
  { key: "height", short: "Height", long: "height", example: "2" },
]

/** Three inputs in a row: length × depth × height (the order staff measure a shelf in). */
function DimensionInputs({
  idPrefix,
  size,
  onChange,
  labelFor,
  captions,
}: {
  idPrefix: string
  size: CellSize
  onChange: (size: CellSize) => void
  labelFor: string
  captions?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-1.5">
      {PARTS.map((part, i) => (
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
              aria-label={`${labelFor} ${part.long}`}
              value={size[part.key]}
              onChange={(e) => onChange({ ...size, [part.key]: e.target.value })}
              placeholder={part.example}
            />
            {captions && <span className="text-muted-foreground block text-center text-[11px]">{part.short}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function UnitSelect({ unit, onChange }: { unit: LengthUnit; onChange: (unit: LengthUnit) => void }) {
  return (
    <Select value={unit} onValueChange={(v) => onChange((v as LengthUnit) ?? "ft")}>
      <SelectTrigger className="w-20 shrink-0" aria-label="Unit for length, depth and height">
        <SelectValue getLabel={(v) => (v === "cm" ? "cm" : "feet")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cm">cm</SelectItem>
        <SelectItem value="ft">feet</SelectItem>
      </SelectContent>
    </Select>
  )
}

/**
 * Size of a module's columns. Normally one "Dimensions" row for every shelf; with "The size of each shelf varies" ticked,
 * one row per shelf (listed top shelf first, like the module stands). A cell is box-shaped, so its capacity is its
 * volume. `shelfCount` is how many shelves the module has (the list follows it); `columns` adds totals to the summary.
 */
export function CellSizeFields({
  idPrefix,
  size,
  unit,
  onSizeChange,
  onUnitChange,
  shelfCount,
  columns,
  changedHint,
}: {
  idPrefix: string
  size: ModuleSize
  unit: LengthUnit
  onSizeChange: (size: ModuleSize) => void
  onUnitChange: (unit: LengthUnit) => void
  shelfCount: number
  columns: number
  changedHint?: React.ReactNode
}) {
  const fitted = fitModuleSize(size, shelfCount)
  const shelves = fitted.shelves
  const check = checkModuleSize(fitted, unit, shelfCount)
  const touched = size.varies
    ? shelves.some((s) => s.length || s.height || s.depth)
    : Boolean(size.common.length || size.common.height || size.common.depth)
  const total = check.ok ? check.volumes.reduce((sum, v) => sum + v * columns, 0) : 0

  const changeUnit = (next: LengthUnit) => {
    onSizeChange({
      ...fitted,
      common: convert(size.common, unit, next),
      shelves: shelves.map((s) => convert(s, unit, next)),
    })
    onUnitChange(next)
  }
  // Starting a per-shelf list: every shelf begins with the size typed so far; going back keeps the bottom shelf's.
  const setVaries = (varies: boolean) =>
    onSizeChange(
      varies
        ? { varies, common: size.common, shelves: resize([], shelfCount, size.common) }
        : { varies, common: shelves[0] ?? size.common, shelves: [] },
    )
  const setShelf = (index: number, next: CellSize) => {
    const list = [...shelves]
    list[index] = next
    onSizeChange({ ...size, shelves: list })
  }

  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={size.varies} onCheckedChange={(v) => setVaries(Boolean(v))} />
        The size of each shelf varies
      </label>

      {!size.varies ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-length`}>Dimensions</FieldLabel>
          <div className="flex items-start gap-1.5">
            <DimensionInputs
              idPrefix={idPrefix}
              size={size.common}
              onChange={(common) => onSizeChange({ ...size, common })}
              labelFor="Column"
              captions
            />
            <UnitSelect unit={unit} onChange={changeUnit} />
          </div>
        </Field>
      ) : (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`${idPrefix}-s${shelfCount}-length`}>Dimensions of each shelf</FieldLabel>
            <UnitSelect unit={unit} onChange={changeUnit} />
          </div>
          {shelfCount < 1 ? (
            <p className="text-muted-foreground text-xs">Enter the number of shelves first.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              <div className="text-muted-foreground flex gap-2 text-[11px]">
                <span className="w-14 shrink-0" />
                {PARTS.map((p) => (
                  <span key={p.key} className="flex-1 text-center">
                    {p.short}
                  </span>
                ))}
              </div>
              {/* top shelf first, as the module stands; shelf 1 is on the floor */}
              {shelves
                .map((shelf, i) => ({ shelf, i }))
                .reverse()
                .map(({ shelf, i }) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-14 shrink-0 pt-1.5 text-xs leading-tight font-medium">
                      Shelf {i + 1}
                      {i === 0 && <span className="text-muted-foreground block text-[10px] font-normal">bottom</span>}
                    </span>
                    <DimensionInputs
                      idPrefix={`${idPrefix}-s${i + 1}`}
                      size={shelf}
                      onChange={(next) => setShelf(i, next)}
                      labelFor={`Shelf ${i + 1}`}
                    />
                  </div>
                ))}
            </div>
          )}
        </Field>
      )}

      <p className="text-muted-foreground -mt-2 text-xs">
        {size.varies
          ? "Every position on a shelf gets that shelf's size. Capacity is volume — length × depth × height, saved in centimetres."
          : "Size of one column (each row × column cell is one storage location). Its capacity is its volume — length × depth × height, saved in centimetres."}
        {check.ok && (
          <>
            {" "}
            <span className="text-foreground tabular-nums">
              ={!size.varies && ` ${formatVolume(check.volumes[0] ?? 0)} per cell ·`}{" "}
              {shelfCount * columns} cells · {formatVolume(total)} total
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
