"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import { useAllocateBoxes, useSuggestSlots } from "@/api/boxes"
import { StoredLocation } from "@/components/location-path"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChooseLocation } from "@/staff/features/warehouses/choose-location"
import { boxLengthCm, formatLength } from "@/domain/dimensions"
import { locationText } from "@/domain/location"
import type { Box, LocationPath, Slot } from "@/api/types"
import { cn } from "@/lib/utils"

const lengthOf = (b: Box) => b.lengthCm ?? boxLengthCm(b.size) // cm

function unitsFor(boxes: Box[]): number {
  return boxes.reduce((sum, b) => sum + lengthOf(b), 0) // total length in cm
}

/**
 * Step 3: put the boxes on shelves — a suggestion for the whole batch, or a position by code / browsing (fills what
 * fits). What is already placed lives in the wizard (`placed`), so going back to the labels and returning keeps it.
 */
export function AllocateStep({
  clientId,
  boxes,
  placed,
  onPlaced,
  onShowSummary,
}: {
  clientId: string
  boxes: Box[]
  placed: Record<string, LocationPath>
  /** Called after each placement; the wizard moves to the summary by itself once the last box is filed. */
  onPlaced: (boxes: Box[]) => void
  onShowSummary: () => void
}) {
  const remaining = boxes.filter((b) => !placed[b.id])
  const filedCount = boxes.length - remaining.length

  const suggestSlots = useSuggestSlots()
  const allocate = useAllocateBoxes()

  useEffect(() => {
    if (remaining.length === 0) return
    suggestSlots.mutate({ clientId, boxSizes: remaining.map((b) => b.size) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-suggest when the remaining batch size changes
  }, [remaining.length])

  function takeForCapacity(free: number): Box[] {
    const taken: Box[] = []
    let used = 0
    for (const box of remaining) {
      if (used + lengthOf(box) > free) continue
      taken.push(box)
      used += lengthOf(box)
    }
    return taken
  }

  async function runAllocation(toPlace: Box[], slotId: string) {
    if (toPlace.length === 0) {
      toast.error("That position doesn't have room for any remaining box")
      return
    }
    try {
      const updated = await allocate.mutateAsync({ allocations: toPlace.map((b) => ({ boxId: b.id, slotId })) })
      onPlaced(updated)
      toast.success(`${toPlace.length} box${toPlace.length === 1 ? "" : "es"} filed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't file the boxes")
    }
  }

  /** A suggestion was scored to fit the *entire* current `remaining` batch — place all of it there. */
  function placeSuggestion(slotId: string) {
    void runAllocation(remaining, slotId)
  }

  /** A position picked by code or in the grid: it may only fit part of the remaining batch — fill what fits. */
  function handleSlotClick(slot: Slot) {
    return runAllocation(takeForCapacity(slot.capacity - slot.used), slot.id)
  }

  const percent = boxes.length ? Math.round((filedCount / boxes.length) * 100) : 0

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        {remaining.length === 0 ? (
          // Only seen when coming back to this step: filing the last box goes straight to the summary.
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <p className="text-status-stored text-sm">
                All {boxes.length} box{boxes.length === 1 ? " is" : "es are"} on a shelf.
              </p>
              <Button size="sm" onClick={onShowSummary}>
                See the summary →
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Suggested positions for all {remaining.length}</h2>
              {suggestSlots.isPending && (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
              )}
              {!suggestSlots.isPending && (suggestSlots.data?.length ?? 0) === 0 && (
                <p className="text-muted-foreground text-sm">
                  No single position fits all {remaining.length} remaining boxes — type a shelf code or browse below.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {suggestSlots.data?.map((s, i) => (
                  <Card key={s.slotId} className={cn(i === 0 && "border-[#b93c2e]/40")}>
                    <CardContent className="flex h-full flex-col gap-2 pt-6">
                      {i === 0 && (
                        <span className="w-fit rounded-full bg-[#b93c2e]/10 px-2 py-0.5 text-[11px] font-semibold text-[#b93c2e]">
                          Best match
                        </span>
                      )}
                      <StoredLocation path={s.locationPath} className="text-sm font-medium" />
                      <p className="text-muted-foreground text-xs">{s.freeCapacity} cm free after placement</p>
                      <ul className="text-muted-foreground list-inside list-disc text-xs">
                        {s.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        className="mt-auto w-fit"
                        disabled={allocate.isPending}
                        onClick={() => placeSuggestion(s.slotId)}
                      >
                        Use this position
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <Card>
              <CardContent className="pt-6">
                <ChooseLocation needCm={unitsFor(remaining)} disabled={allocate.isPending} onPick={handleSlotClick} />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress</CardTitle>
            <CardDescription>
              {filedCount} of {boxes.length} filed · {formatLength(unitsFor(remaining))} still to place
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div className="bg-status-stored h-full rounded-full transition-all" style={{ width: `${percent}%` }} />
            </div>
            {remaining.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">Waiting</p>
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {remaining.map((b) => (
                    <span key={b.id} className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">
                      {b.boxNumber}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {filedCount > 0 && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">Filed</p>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {boxes
                    .filter((b) => placed[b.id])
                    .map((b) => (
                      <li key={b.id} className="flex justify-between gap-2">
                        <span className="font-mono">{b.boxNumber}</span>
                        <span className="text-muted-foreground truncate">{locationText(placed[b.id])}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
