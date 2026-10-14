import type { BoxSize } from "@/api/types"

// Storage is measured in centimetres, not "box units": every rack cell (row × column) is one storage
// location with a length, and each box takes up part of that length. Mirrors the backend's
// src/utils/dimensions.js — keep the two in sync.

/** Length (cm) a box occupies in a cell. (Used to be standard = 1 unit, large = 2 units; 1 unit = 40 cm.) */
export const BOX_LENGTH_CM: Record<BoxSize, number> = { standard: 40, large: 80 }

export const CM_PER_FOOT = 30.48

export type LengthUnit = "cm" | "ft"

export function boxLengthCm(size: BoxSize): number {
  return BOX_LENGTH_CM[size]
}

/** User-entered length (cm or feet) -> whole centimetres, exactly as the backend stores it. */
export function toCentimetres(value: number, unit: LengthUnit): number {
  return Math.round(value * (unit === "ft" ? CM_PER_FOOT : 1))
}

/** "366 cm (12.0 ft)" */
export function formatLength(cm: number): string {
  return `${cm} cm (${(cm / CM_PER_FOOT).toFixed(1)} ft)`
}
