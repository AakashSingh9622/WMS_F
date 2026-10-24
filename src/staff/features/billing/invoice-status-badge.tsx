import type { InvoiceStatus } from "@/api/invoices"
import { Badge } from "@/components/ui/badge"

const META: Record<InvoiceStatus, { label: string; variant: "outline" | "secondary" | "default" }> = {
  draft: { label: "Draft", variant: "outline" },
  sending: { label: "Sending to Sage", variant: "secondary" },
  issued: { label: "In Sage", variant: "default" },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={META[status].variant}>{META[status].label}</Badge>
}
