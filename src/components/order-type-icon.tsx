import { ORDER_TYPE_META } from "@/domain/status"
import type { OrderType } from "@/api/types"
import { cn } from "@/lib/utils"

export function OrderTypeIcon({ type, className }: { type: OrderType; className?: string }) {
  const Icon = ORDER_TYPE_META[type].icon
  return <Icon className={cn("size-4", className)} aria-hidden />
}

export function OrderTypeLabel({ type }: { type: OrderType }) {
  const meta = ORDER_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4" aria-hidden />
      {meta.label}
    </span>
  )
}
