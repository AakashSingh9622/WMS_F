import { Check } from "@/components/icons"

import { ORDER_STATUS_LABEL } from "@/domain/status"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/api/types"

const HAPPY_PATH: OrderStatus[] = ["requested", "approved", "scheduled", "in_progress", "completed"]

export function StatusStepper({ status }: { status: OrderStatus }) {
  if (status === "cancelled" || status === "rejected") {
    return (
      <div className="border-status-hold text-status-hold w-fit rounded-md border px-3 py-1.5 text-sm font-medium">
        {ORDER_STATUS_LABEL[status]}
      </div>
    )
  }

  const currentIndex = HAPPY_PATH.indexOf(status)
  const steps = status === "requested" ? HAPPY_PATH : HAPPY_PATH.slice(1) // staff orders skip "requested"

  return (
    <ol className="flex items-center gap-1">
      {steps.map((step) => {
        const stepIndex = HAPPY_PATH.indexOf(step)
        const done = stepIndex < currentIndex
        const active = stepIndex === currentIndex
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                done && "border-status-stored bg-status-stored/10 text-status-stored",
                active && "border-primary bg-primary/10 text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done && <Check className="size-3" />}
              {ORDER_STATUS_LABEL[step]}
            </span>
            {step !== steps[steps.length - 1] && <span className="text-muted-foreground">→</span>}
          </li>
        )
      })}
    </ol>
  )
}
