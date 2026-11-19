import { cn } from "@/lib/utils"

/** How many documents one box holds (each uploaded file is one document). */
export const BOX_DOCUMENT_CAPACITY = 100

/**
 * Progress bar of a box's documents: `used` are already in the box, `adding` are the files about to be uploaded.
 * Green up to 79, amber from 80, red when full (or when `adding` would overfill it).
 */
export function BoxCapacityBar({
  used,
  adding = 0,
  className,
}: {
  used: number
  adding?: number
  className?: string
}) {
  const capacity = BOX_DOCUMENT_CAPACITY
  const total = used + adding
  const left = Math.max(0, capacity - used)
  const over = total > capacity
  const usedPct = Math.min(100, (used / capacity) * 100)
  const addingPct = Math.min(100 - usedPct, (adding / capacity) * 100)
  const tone = over || total >= capacity ? "bg-red-500" : total >= 80 ? "bg-amber-500" : "bg-emerald-500"

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium tabular-nums">
          {adding > 0 ? `${used} + ${adding} = ${total}` : used} / {capacity} documents
        </span>
        <span className={cn("tabular-nums", over || left === 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
          {left === 0 ? "Box is full" : `${left} left`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(total, capacity)}
        aria-label="Box document space used"
        className="bg-muted flex h-2 overflow-hidden rounded-full"
      >
        <div className={cn("h-full transition-all", tone)} style={{ width: `${usedPct}%` }} />
        {addingPct > 0 && <div className={cn("h-full opacity-50 transition-all", tone)} style={{ width: `${addingPct}%` }} />}
      </div>
    </div>
  )
}
