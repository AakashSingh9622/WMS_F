// Thresholds will move to Settings → Orders (spec §7 "Staff: Settings") once that screen exists;
// fixed defaults for now, used by every capacity bar (warehouse, rack) for a consistent read.
export const CAPACITY_WARNING_THRESHOLD = 0.75
export const CAPACITY_CRITICAL_THRESHOLD = 0.9

export type CapacityLevel = "good" | "warning" | "critical"

export function capacityPercent(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((used / total) * 100)
}

export function capacityLevel(used: number, total: number): CapacityLevel {
  const ratio = total > 0 ? used / total : 0
  if (ratio >= CAPACITY_CRITICAL_THRESHOLD) return "critical"
  if (ratio >= CAPACITY_WARNING_THRESHOLD) return "warning"
  return "good"
}
