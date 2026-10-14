"use client"

import { useMemo, useState } from "react"

import type { Box, OrderType } from "@/api/types"
import { getBoxIneligibilityReason, isDestroyAfterInFuture } from "@/domain/orders"
import { BoxStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Server-driven mode: the parent runs the (debounced) search and paging against the API, so a client with
 * thousands of boxes can still be searched — the picker only ever holds one page. Without it the picker
 * just filters the `boxes` it was given (used where the list is small, e.g. the portal).
 */
export interface BoxPickerServerSearch {
  query: string
  onQueryChange: (q: string) => void
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  loading?: boolean
  /** Also list boxes that cannot go on this order (shown greyed out with the reason). */
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
}

export interface BoxPickerProps {
  boxes: Box[]
  type: OrderType
  selectedIds: string[]
  onChange: (ids: string[]) => void
  server?: BoxPickerServerSearch
}

/** Live-validated box picker for order creation (spec §7: "ineligible ones are shown with the reason"). */
export function BoxPicker({ boxes, type, selectedIds, onChange, server }: BoxPickerProps) {
  const [localQ, setLocalQ] = useState("")
  const q = server ? server.query : localQ
  const setQ = server ? server.onQueryChange : setLocalQ

  const filtered = useMemo(() => {
    if (server || !q) return boxes
    const needle = q.toLowerCase()
    return boxes.filter(
      (b) => b.boxNumber.toLowerCase().includes(needle) || b.description.toLowerCase().includes(needle),
    )
  }, [boxes, q, server])

  function toggle(boxId: string, eligible: boolean) {
    if (!eligible) return
    onChange(selectedIds.includes(boxId) ? selectedIds.filter((id) => id !== boxId) : [...selectedIds, boxId])
  }

  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boxes to add…" />
      <p className="text-muted-foreground text-xs tabular-nums">{selectedIds.length} selected</p>
      <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-1">
        {server?.loading && <p className="text-muted-foreground p-3 text-sm">Searching…</p>}
        {!server?.loading && filtered.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">No boxes found.</p>
        )}
        {filtered.map((box) => {
          const reason = getBoxIneligibilityReason(box, type)
          const eligible = !reason
          const checked = selectedIds.includes(box.id)
          return (
            <label
              key={box.id}
              className={cn(
                "flex items-center gap-3 rounded-md p-2 text-sm",
                eligible ? "hover:bg-muted/50 cursor-pointer" : "cursor-not-allowed opacity-50",
              )}
            >
              <Checkbox checked={checked} disabled={!eligible} onCheckedChange={() => toggle(box.id, eligible)} />
              <span className="flex-1">
                <span className="font-medium">{box.boxNumber}</span>
                <span className="text-muted-foreground"> — {box.description}</span>
              </span>
              {type !== "collection" && isDestroyAfterInFuture(box) && (
                <Badge variant="outline" className="border-status-pending-destruction text-status-pending-destruction">
                  Destroy-after in future
                </Badge>
              )}
              {reason ? (
                <span className="text-destructive text-xs">{reason}</span>
              ) : (
                <BoxStatusBadge status={box.status} />
              )}
            </label>
          )
        })}
      </div>

      {server && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="text-muted-foreground flex items-center gap-2">
            <Checkbox checked={server.showAll} onCheckedChange={(v) => server.onShowAllChange(!!v)} />
            Also show boxes that can&apos;t be added
          </label>
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">
              {server.total === 0
                ? "0 boxes"
                : `${(server.page - 1) * server.pageSize + 1}–${Math.min(server.page * server.pageSize, server.total)} of ${server.total.toLocaleString("en-GB")}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={server.page <= 1}
              onClick={() => server.onPageChange(server.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={server.page * server.pageSize >= server.total}
              onClick={() => server.onPageChange(server.page + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}
