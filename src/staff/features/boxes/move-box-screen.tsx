"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useBox, useAllocateBoxes, useSuggestSlots } from "@/api/boxes"
import { StoredLocation } from "@/components/location-path"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { boxLengthCm } from "@/domain/dimensions"
import { ChooseLocation } from "@/staff/features/warehouses/choose-location"
import type { Slot } from "@/api/types"

export function MoveBoxScreen({ boxId }: { boxId: string }) {
  const router = useRouter()
  const { data: box, isLoading } = useBox(boxId)
  const [reason, setReason] = useState("")

  const suggestSlots = useSuggestSlots()
  const allocate = useAllocateBoxes()

  useEffect(() => {
    if (!box) return
    suggestSlots.mutate({ clientId: box.clientId, boxSizes: [box.size] })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch suggestions once the box loads
  }, [box?.id])

  async function moveTo(slotId: string) {
    if (!reason) {
      toast.error("A reason is required to move a box")
      return
    }
    try {
      await allocate.mutateAsync({ allocations: [{ boxId, slotId }], reason })
      toast.success("Box moved")
      router.push(`/app/boxes/${boxId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move the box")
    }
  }

  function handleSlotClick(slot: Slot) {
    return moveTo(slot.id)
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!box) return null

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Move {box.boxNumber}</h1>
        {box.locationPath && (
          <p className="text-muted-foreground text-sm">
            Currently in <StoredLocation path={box.locationPath} />
          </p>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Field>
            <FieldLabel htmlFor="move-reason">Step 1 · Why is this box moving? (required)</FieldLabel>
            <Input
              id="move-reason"
              placeholder="e.g. Consolidating this client's boxes in one module"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {!reason && <p className="text-muted-foreground text-xs">Type a reason to enable the “Move here” buttons.</p>}
          </Field>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Step 2 · Choose a new position</h2>
          <p className="text-muted-foreground text-xs">Suggested positions first — best match at the top.</p>
        </div>
        {suggestSlots.isPending && <Skeleton className="h-24 w-full" />}
        {suggestSlots.data?.length === 0 && (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            No suggestion fits — find a position below.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {suggestSlots.data?.map((s, i) => (
            <Card key={s.slotId} className={i === 0 ? "ring-primary/40 ring-2" : undefined}>
              <CardContent className="flex h-full flex-col justify-between gap-3 py-4">
                <div className="space-y-1">
                  {i === 0 && (
                    <span className="bg-primary/10 text-primary inline-block rounded-full px-2 py-0.5 text-[11px] font-medium">
                      Best match
                    </span>
                  )}
                  <div className="text-sm font-medium">
                    <StoredLocation path={s.locationPath} />
                  </div>
                  <ul className="text-muted-foreground list-inside list-disc text-xs">
                    {s.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <Button
                  size="sm"
                  variant={i === 0 ? "default" : "outline"}
                  className="self-start"
                  disabled={!reason || allocate.isPending}
                  onClick={() => moveTo(s.slotId)}
                >
                  Move here
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <ChooseLocation
        needCm={box.lengthCm ?? boxLengthCm(box.size)}
        selectedSlotId={box.slotId}
        disabled={!reason || allocate.isPending}
        pickLabel="Move here"
        onPick={handleSlotClick}
      />
    </div>
  )
}
