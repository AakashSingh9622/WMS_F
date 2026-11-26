"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAllocateBoxes, useBoxSearch, useSuggestSlots } from "@/api/boxes"
import { StoredLocation } from "@/components/location-path"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChooseLocation, type PickedPlace } from "@/staff/features/warehouses/choose-location"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { boxVolume, formatVolume } from "@/domain/dimensions"
import { locationText } from "@/domain/location"
import type { Box, LocationPath, Slot } from "@/api/types"
import { cn } from "@/lib/utils"

/** A filing waiting for the user to confirm it (so a misclick never files boxes). */
interface PendingFiling {
  toPlace: Box[]
  slotId: string
  where: { path: LocationPath } | { place: PickedPlace }
  /** Resolves when the dialog is answered, so the position picker refreshes only after the boxes moved. */
  done: () => void
}

/** Total space (cm³) these boxes take in a cell. */
function unitsFor(boxes: Box[]): number {
  return boxes.reduce((sum, b) => sum + boxVolume(b), 0)
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
  // Docbox shows the location of the most recently registered box so the next ones can go next to it: the client's
  // newest box that is already on a shelf.
  const lastFiled = useBoxSearch({ clientId, status: ["stored"], page: 1, pageSize: 1 }, { enabled: remaining.length > 0 })
  const lastBox = lastFiled.data?.items[0]

  useEffect(() => {
    if (remaining.length === 0) return
    suggestSlots.mutate({ clientId, boxSizes: remaining.map((b) => b.size) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-suggest when the remaining batch size changes
  }, [remaining.length])

  function takeForCapacity(free: number): Box[] {
    const taken: Box[] = []
    let used = 0
    for (const box of remaining) {
      if (used + boxVolume(box) > free) continue
      taken.push(box)
      used += boxVolume(box)
    }
    return taken
  }

  const [pending, setPending] = useState<PendingFiling | null>(null)

  /** Asks first; files only once the user confirms. Resolves when the dialog is closed either way. */
  function confirmFiling(toPlace: Box[], slotId: string, where: PendingFiling["where"]): Promise<void> {
    if (toPlace.length === 0) {
      toast.error("That position doesn't have room for any remaining box")
      return Promise.resolve()
    }
    return new Promise((resolve) => setPending({ toPlace, slotId, where, done: resolve }))
  }

  function closePending() {
    pending?.done()
    setPending(null)
  }

  async function runAllocation(toPlace: Box[], slotId: string) {
    try {
      const updated = await allocate.mutateAsync({ allocations: toPlace.map((b) => ({ boxId: b.id, slotId })) })
      onPlaced(updated)
      toast.success(`${toPlace.length} box${toPlace.length === 1 ? "" : "es"} filed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't file the boxes")
    }
  }

  /** A suggestion was scored to fit the *entire* current `remaining` batch — place all of it there. */
  function placeSuggestion(slotId: string, path: LocationPath) {
    void confirmFiling(remaining, slotId, { path })
  }

  /** A position picked by code or in the grid: it may only fit part of the remaining batch — fill what fits. */
  function handleSlotClick(slot: Slot, place: PickedPlace) {
    return confirmFiling(takeForCapacity(slot.capacity - slot.used), slot.id, { place })
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
              <p className="text-muted-foreground text-xs">
                {remaining.length === 1
                  ? "Each card is one position with room for this box."
                  : `Each card is one position with room for all ${remaining.length} boxes — they will all go there together (${formatVolume(unitsFor(remaining))}).`}
              </p>
              {lastBox?.slotId && lastBox.locationPath && (
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">Same place as the last box of this client ({lastBox.boxNumber})</p>
                      <StoredLocation path={lastBox.locationPath} className="text-sm font-medium" />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={allocate.isPending}
                      onClick={() =>
                        void confirmFiling(remaining, lastBox.slotId as string, { path: lastBox.locationPath as LocationPath })
                      }
                    >
                      Use the same place
                    </Button>
                  </CardContent>
                </Card>
              )}
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
                      <p className="text-muted-foreground text-xs">
                        Fits all {remaining.length === 1 ? "1 box" : `${remaining.length} boxes`} · {formatVolume(s.freeCapacity)} free after placement
                      </p>
                      <ul className="text-muted-foreground list-inside list-disc text-xs">
                        {s.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        className="mt-auto w-fit"
                        disabled={allocate.isPending}
                        onClick={() => placeSuggestion(s.slotId, s.locationPath)}
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

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && closePending()}
          title={`File ${pending.toPlace.length === 1 ? "this box" : `these ${pending.toPlace.length} boxes`} here?`}
          description={<FilingSummary pending={pending} remaining={remaining.length} />}
          confirmLabel={`File ${pending.toPlace.length === 1 ? "box" : `${pending.toPlace.length} boxes`}`}
          // the dialog closes itself (onOpenChange(false)) once this finishes
          onConfirm={() => runAllocation(pending.toPlace, pending.slotId)}
        />
      )}

      <aside className="space-y-4 xl:sticky xl:top-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress</CardTitle>
            <CardDescription>
              {filedCount} of {boxes.length} filed · {formatVolume(unitsFor(remaining))} still to place
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

/** What the confirmation says: where, which boxes, and what happens next. */
function FilingSummary({ pending, remaining }: { pending: PendingFiling; remaining: number }) {
  const count = pending.toPlace.length
  const left = remaining - count
  return (
    <span className="block space-y-3">
      <span className="bg-muted block rounded-md px-3 py-2">
        {"path" in pending.where ? (
          <StoredLocation path={pending.where.path} className="text-foreground text-sm font-medium" />
        ) : (
          <span className="text-foreground block text-sm">
            <span className="font-medium">
              {pending.where.place.module ?? "Module"} · shelf {pending.where.place.shelf} · position {pending.where.place.position}
            </span>
            <span className="text-muted-foreground block font-mono text-xs">{pending.where.place.code}</span>
          </span>
        )}
      </span>
      <span className="block">
        {count === 1 ? "Box " : `${count} boxes: `}
        <span className="text-foreground font-mono text-xs">
          {pending.toPlace
            .slice(0, 12)
            .map((b) => b.boxNumber)
            .join(", ")}
          {count > 12 && ` and ${count - 12} more`}
        </span>
      </span>
      <span className="block">
        {left > 0
          ? `Only ${count} of the ${remaining} waiting box${remaining === 1 ? "" : "es"} fit here — the other ${left} stay waiting for another position.`
          : "This files the last box of the batch, then shows the summary."}
      </span>
    </span>
  )
}
