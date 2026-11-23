import type { Box, BoxSize, BoxSizeType } from "@/api/types"

// Storage is measured as VOLUME in cm³: every rack cell (row × column) is one box-shaped storage location
// (length × height × depth) and each box takes up part of that volume (its own length × height × depth).
// Mirrors the backend's src/utils/dimensions.js — keep the two in sync.

/** Height and depth every cell and box size had before they were entered separately. */
export const DEFAULT_HEIGHT_CM = 50
export const DEFAULT_DEPTH_CM = 50

/** Biggest value of one dimension (cm); 1000³ still fits the backend's 32-bit integer. */
export const MAX_DIMENSION_CM = 1000

/** Default length (cm) of the two built-in sizes, used until the size list has loaded. */
export const BOX_LENGTH_CM: Record<BoxSize, number> = { standard: 40, large: 80 }

export const CM_PER_FOOT = 30.48

export type LengthUnit = "cm" | "ft"

export function volumeCm3(lengthCm: number, heightCm = DEFAULT_HEIGHT_CM, depthCm = DEFAULT_DEPTH_CM): number {
  return lengthCm * heightCm * depthCm
}

/** Default space (cm³) of the two built-in sizes, used until the size list has loaded. */
export const BOX_VOLUME_CM3: Record<BoxSize, number> = {
  standard: volumeCm3(BOX_LENGTH_CM.standard),
  large: volumeCm3(BOX_LENGTH_CM.large),
}

/** The space one box size takes in a cell. */
export function sizeVolumeCm3(size: Pick<BoxSizeType, "lengthCm" | "heightCm" | "depthCm" | "volumeCm3">): number {
  return size.volumeCm3 ?? volumeCm3(size.lengthCm, size.heightCm, size.depthCm)
}

/** What a box counts for in a cell: the volume saved on it at registration; older boxes fall back to their size's default. */
export function boxVolume(box: Pick<Box, "size" | "lengthCm" | "heightCm" | "depthCm" | "volumeCm3">): number {
  if (box.volumeCm3 != null) return box.volumeCm3
  const length = box.lengthCm ?? BOX_LENGTH_CM[box.size] ?? BOX_LENGTH_CM.standard
  return volumeCm3(length, box.heightCm ?? DEFAULT_HEIGHT_CM, box.depthCm ?? DEFAULT_DEPTH_CM)
}

/** User-entered length (cm or feet) -> whole centimetres, exactly as the backend stores it. */
export function toCentimetres(value: number, unit: LengthUnit): number {
  return Math.round(value * (unit === "ft" ? CM_PER_FOOT : 1))
}

/** "366 cm (12.0 ft)" */
export function formatLength(cm: number): string {
  return `${cm} cm (${(cm / CM_PER_FOOT).toFixed(1)} ft)`
}

/** "120 × 50 × 50 cm" */
export function formatDimensions(lengthCm: number, heightCm: number, depthCm: number): string {
  return `${lengthCm} × ${heightCm} × ${depthCm} cm`
}

/** A volume in cm³ split for display: litres, or m³ from 1,000 L up — { value: "1.5", unit: "m³" }. */
export function volumeParts(cm3: number): { value: string; unit: "L" | "m³" } {
  const litres = cm3 / 1000
  if (litres >= 1000) return { value: Number((litres / 1000).toFixed(2)).toLocaleString("en-GB"), unit: "m³" }
  return { value: Number(litres.toFixed(1)).toLocaleString("en-GB"), unit: "L" }
}

/** A volume in cm³ as litres, or m³ from 1,000 L up: "100 L", "1.5 m³". */
export function formatVolume(cm3: number): string {
  const { value, unit } = volumeParts(cm3)
  return `${value} ${unit}`
}

export const CM3_PER_CUBIC_FOOT = CM_PER_FOOT ** 3

/** "52.97 ft³" */
export function formatCubicFeet(cm3: number): string {
  return `${Number((cm3 / CM3_PER_CUBIC_FOOT).toFixed(2)).toLocaleString("en-GB")} ft³`
}

/** One shelf of a module: its row (1 = bottom) and the size of each of its positions, in cm. */
export interface ShelfSize {
  row: number
  lengthCm: number
  heightCm: number
  depthCm: number
}

/** Every shelf of a rack, bottom first — from `rack.shelves`, or the cell size repeated (older API responses). */
export function rackShelves(rack: {
  rows: number
  cellLengthCm: number
  cellHeightCm: number
  cellDepthCm: number
  shelves?: ShelfSize[]
}): ShelfSize[] {
  if (rack.shelves?.length === rack.rows) return rack.shelves
  return Array.from({ length: rack.rows }, (_, i) => ({
    row: i + 1,
    lengthCm: rack.cellLengthCm,
    heightCm: rack.cellHeightCm,
    depthCm: rack.cellDepthCm,
  }))
}

/** Result of validating the three fields of a size form (each a text input, in `unit`). */
export type DimensionCheck = { ok: true; length: number; height: number; depth: number } | { ok: false; error: string }

/** Length / height / depth typed by the user (all in `unit`) -> whole cm, or the first problem as text. */
export function checkDimensions(
  fields: { length: string; height: string; depth: string },
  unit: LengthUnit,
): DimensionCheck {
  const out: number[] = []
  for (const [label, raw] of [
    ["Length", fields.length],
    ["Height", fields.height],
    ["Depth", fields.depth],
  ] as const) {
    const n = Number(raw)
    if (!raw.trim() || !(n > 0)) return { ok: false, error: `${label} must be a positive number` }
    const cm = toCentimetres(n, unit)
    if (cm < 1 || cm > MAX_DIMENSION_CM) return { ok: false, error: `${label} must be between 1 and ${MAX_DIMENSION_CM} cm` }
    out.push(cm)
  }
  return { ok: true, length: out[0], height: out[1], depth: out[2] }
}
