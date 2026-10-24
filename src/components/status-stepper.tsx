import { Check } from "@/components/icons"

import { ORDER_STATUS_LABEL } from "@/domain/status"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/api/types"

const HAPPY_PATH: OrderStatus[] = ["requested", "approved", "scheduled", "in_progress", "ready", "completed"]

/** On hold shows where the order was paused (heldFrom); "Ready" (all boxes picked) only appears once reached. */
export function StatusStepper({ status, heldFrom }: { status: OrderStatus; heldFrom?: OrderStatus }) {
  if (status === "cancelled" || status === "rejected") {
    return (
      <div className="border-status-hold text-status-hold w-fit rounded-md border px-3 py-1.5 text-sm font-medium">
        {ORDER_STATUS_LABEL[status]}
      </div>
    )
  }

  const onHold = status === "on_hold"
  const at = onHold ? (heldFrom ?? "approved") : status
  const currentIndex = HAPPY_PATH.indexOf(at)
  const path = at === "ready" ? HAPPY_PATH : HAPPY_PATH.filter((s) => s !== "ready")
  const steps = at === "requested" ? path : path.slice(1) // staff orders skip "requested"

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {onHold && (
        <li className="border-status-hold text-status-hold mr-1 rounded-full border px-2.5 py-1 text-xs font-medium">
          {ORDER_STATUS_LABEL.on_hold}
        </li>
      )}
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
