"use client"

import { Check } from "@/components/icons"
import { cn } from "@/lib/utils"

export type RegisterStep = "details" | "labels" | "allocate" | "done"

const STEPS: { id: RegisterStep; title: string; hint: string }[] = [
  { id: "details", title: "Details", hint: "Client, contents, dates" },
  { id: "labels", title: "Print labels", hint: "Stick one on each box" },
  { id: "allocate", title: "File boxes", hint: "Put each box on a shelf" },
  { id: "done", title: "Done", hint: "Summary" },
]

/**
 * Wizard progress across the full width. Every step you can already reach is a button, so you can go back and forth
 * (Details is always reachable; Labels / File boxes once the boxes exist; Done once you have finished).
 */
export function RegisterStepper({
  current,
  canOpen,
  onOpen,
}: {
  current: RegisterStep
  canOpen: (step: RegisterStep) => boolean
  onOpen: (step: RegisterStep) => void
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)
  return (
    <nav aria-label="Registration steps">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((step, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo"
          const open = canOpen(step.id) && step.id !== current
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!open}
                onClick={() => onOpen(step.id)}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  state === "current" && "border-[#b93c2e]/50 bg-[#b93c2e]/5",
                  open && "hover:border-[#b93c2e]/40 hover:bg-muted/50",
                  !open && state !== "current" && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                    state === "current" && "border-[#b93c2e] bg-[#b93c2e] text-white",
                    state === "done" && "border-status-stored bg-status-stored text-white",
                  )}
                >
                  {state === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{step.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{step.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
