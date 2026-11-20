import { RECORD_REQUEST_KIND_LABELS, RECORD_REQUEST_STATUS_LABELS, type RecordRequestKind, type RecordRequestStatus } from "@/api/recordRequests"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const VARIANT: Record<RecordRequestStatus, "secondary" | "default" | "outline" | "destructive"> = {
  pending: "outline",
  requested: "secondary",
  delivered: "default",
  returned: "outline",
  cancelled: "destructive",
}

export function RequestStatusBadge({ status }: { status: RecordRequestStatus }) {
  // a request waiting for staff to accept it stands out
  return (
    <Badge variant={VARIANT[status]} className={cn(status === "pending" && "border-amber-500 bg-amber-100 text-amber-900")}>
      {RECORD_REQUEST_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Original (the paper goes to the client) or digital copy (a scan: the paper never leaves its box). */
export function RequestKindBadge({ kind }: { kind: RecordRequestKind }) {
  return (
    <Badge variant="outline" className={cn(kind === "digital" && "border-sky-400 bg-sky-50 text-sky-900")}>
      {RECORD_REQUEST_KIND_LABELS[kind]}
    </Badge>
  )
}
