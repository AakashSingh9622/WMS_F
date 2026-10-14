import Link from "next/link"
import { Fragment } from "react"

export interface LocationPathSegment {
  label: string
  href?: string
}

/** Renders "WH1 › Rack B-04 › Slot 3-2" (spec §7, "location path shown prominently"). */
export function LocationPath({ segments, className }: { segments: LocationPathSegment[]; className?: string }) {
  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-muted-foreground mx-1.5">›</span>}
          {segment.href ? (
            <Link href={segment.href} className="hover:text-primary underline-offset-2 hover:underline">
              {segment.label}
            </Link>
          ) : (
            <span>{segment.label}</span>
          )}
        </Fragment>
      ))}
    </span>
  )
}
