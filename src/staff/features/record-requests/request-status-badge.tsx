import { RECORD_REQUEST_STATUS_LABELS, type RecordRequestStatus } from "@/api/recordRequests"
import { Badge } from "@/components/ui/badge"

const VARIANT: Record<RecordRequestStatus, "secondary" | "default" | "outline" | "destructive"> = {
  requested: "secondary",
  delivered: "default",
  returned: "outline",
  cancelled: "destructive",
}

export function RequestStatusBadge({ status }: { status: RecordRequestStatus }) {
  return <Badge variant={VARIANT[status]}>{RECORD_REQUEST_STATUS_LABELS[status]}</Badge>
}
