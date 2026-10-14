import { Badge } from "@/components/ui/badge"
import { BOX_STATUS_META, ORDER_STATUS_LABEL, PORTAL_BOX_STATUS_LABEL } from "@/domain/status"
import type { BoxStatus } from "@/api/types"
import { cn } from "@/lib/utils"

export function BoxStatusBadge({ status, className }: { status: BoxStatus; className?: string }) {
  const meta = BOX_STATUS_META[status]
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  )
}

export function PortalBoxStatusBadge({ status, className }: { status: BoxStatus; className?: string }) {
  const meta = BOX_STATUS_META[status]
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {PORTAL_BOX_STATUS_LABEL[status]}
    </Badge>
  )
}

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}
