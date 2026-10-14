import type { ReactNode } from "react"

import type { AppIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

/**
 * The title block every staff page starts with: a brand-coloured icon chip, the title, one line of help text and
 * (optionally) the page's main actions on the right. Keeps all pages looking like one product.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: AppIcon
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#b93c2e]/10 text-[#b93c2e]">
            <Icon className="size-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
