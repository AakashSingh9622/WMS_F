import Link from "next/link"

import type { AuditEvent } from "@/api/types"
import { describeAuditEvent } from "@/domain/audit"
import { formatDateTime, formatRelativeTime } from "@/lib/formatting"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function AuditTimeline({
  events,
  audience = "staff",
  orderHref,
}: {
  events: AuditEvent[]
  audience?: "staff" | "client"
  orderHref?: (orderId: string) => string
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity yet.</p>
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => {
        const described = describeAuditEvent(event, audience)
        return (
          <li key={event.id} className="border-border flex gap-3 border-l-2 pl-3">
            <div className="flex-1 space-y-0.5">
              <p className="text-sm">
                <span className="font-medium">{described.verb}</span>
                {described.text.slice(described.verb.length)}
                {audience === "staff" && event.orderId && event.orderNumber && orderHref && (
                  <>
                    {" "}
                    <Link href={orderHref(event.orderId)} className="text-primary underline-offset-2 hover:underline">
                      ({event.orderNumber})
                    </Link>
                  </>
                )}
              </p>
              <Tooltip>
                <TooltipTrigger render={<span className="text-muted-foreground cursor-default text-xs" />}>
                  {formatRelativeTime(event.at)}
                </TooltipTrigger>
                <TooltipContent>{formatDateTime(event.at)}</TooltipContent>
              </Tooltip>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
