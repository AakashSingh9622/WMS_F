import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { cn } from "@/lib/utils"

const LEVEL_CLASS: Record<ReturnType<typeof capacityLevel>, string> = {
  good: "bg-status-stored",
  warning: "bg-status-pending-destruction",
  critical: "bg-status-hold",
}

export function CapacityBar({ used, total, className }: { used: number; total: number; className?: string }) {
  const percent = capacityPercent(used, total)
  const level = capacityLevel(used, total)

  return (
    <div className={cn("space-y-1", className)}>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all", LEVEL_CLASS[level])}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-muted-foreground font-mono text-xs tabular-nums">
        {used}/{total} cm · {percent}%
      </p>
    </div>
  )
}
