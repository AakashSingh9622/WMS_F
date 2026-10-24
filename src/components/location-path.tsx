import Link from "next/link"
import { Fragment } from "react"

import type { LocationPath as StoredPath } from "@/api/types"
import { locationSegments } from "@/domain/location"

export interface LocationPathSegment {
  label: string
  href?: string
}

/** A box's stored location: "WH1 › Zone A › Aisle 3 › Rack B04 › Shelf 3 · Position 2" (old snapshots too). */
export function StoredLocation({ path, className }: { path: StoredPath; className?: string }) {
  return <LocationPath segments={locationSegments(path).map((label) => ({ label }))} className={className} />
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
