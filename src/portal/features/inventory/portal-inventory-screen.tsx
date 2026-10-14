"use client"

import Link from "next/link"
import { useState } from "react"

import { usePortalBoxes } from "@/api/portal"
import { useDebounce } from "@/hooks/useDebounce"
import { PortalBoxStatusBadge } from "@/components/status-badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export function PortalInventoryScreen() {
  const [q, setQ] = useState("")
  const debouncedQ = useDebounce(q, 300)
  const { data, isLoading } = usePortalBoxes({ q: debouncedQ || undefined })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">My boxes</h1>
        <p className="text-muted-foreground">{data?.total ?? 0} boxes in your archive.</p>
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your boxes…" className="max-w-sm" />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && data?.items.length === 0 && <p className="text-muted-foreground text-sm">No boxes found.</p>}

      <div className="space-y-2">
        {data?.items.map((box) => (
          <Link
            key={box.id}
            href={`/portal/inventory/${box.id}`}
            className="hover:border-primary/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
          >
            <div>
              <p className="font-medium">{box.boxNumber}</p>
              <p className="text-muted-foreground text-sm">{box.description}</p>
            </div>
            <PortalBoxStatusBadge status={box.status} />
          </Link>
        ))}
      </div>
    </div>
  )
}
