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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Move {box.boxNumber}</h1>
        {box.locationPath && (
          <p className="text-muted-foreground text-sm">
            Currently in <StoredLocation path={box.locationPath} />
          </p>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="move-reason">Reason for the move (required)</FieldLabel>
        <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" />
      </Field>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Suggested positions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {suggestSlots.data?.map((s) => (
            <Card key={s.slotId}>
              <CardContent className="space-y-2 pt-6">
                <StoredLocation path={s.locationPath} />
                <ul className="text-muted-foreground list-inside list-disc text-xs">
                  {s.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <Button size="sm" disabled={!reason || allocate.isPending} onClick={() => moveTo(s.slotId)}>
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
