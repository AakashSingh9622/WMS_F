"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAllocateBoxes, useSuggestSlots } from "@/api/boxes"
import { useWarehouses, useWarehouseRacks, useRackSlots } from "@/api/warehouses"
import { SlotGrid, SlotGridLegend } from "@/components/slot-grid"
import { LocationPath } from "@/components/location-path"
import { CapacityBar } from "@/components/capacity-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { boxLengthCm } from "@/domain/dimensions"
import type { Box, Slot } from "@/api/types"

function unitsFor(boxes: Box[]): number {
  return boxes.reduce((sum, b) => sum + (b.lengthCm ?? boxLengthCm(b.size)), 0) // total length in cm
}

export function AllocateStep({
  clientId,
  boxes,
  onFinish,
}: {
  clientId: string
  boxes: Box[]
  onFinish: (unallocatedCount: number) => void
}) {
  const [remaining, setRemaining] = useState<Box[]>(boxes)
  const [warehouseId, setWarehouseId] = useState("")
  const [rackId, setRackId] = useState("")

  const suggestSlots = useSuggestSlots()
  const allocate = useAllocateBoxes()
  const { data: warehouses } = useWarehouses()
  const { data: racks } = useWarehouseRacks(warehouseId)
  const { data: slots } = useRackSlots(rackId)
  const selectedRack = racks?.find((r) => r.id === rackId)

  useEffect(() => {
    if (remaining.length === 0) return
    suggestSlots.mutate({ clientId, boxSizes: remaining.map((b) => b.size) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-suggest when the remaining batch size changes
  }, [remaining.length])

  function takeForCapacity(free: number): Box[] {
    const taken: Box[] = []
    let used = 0
    for (const box of remaining) {
      const units = box.lengthCm ?? boxLengthCm(box.size) // cm
      if (used + units > free) continue
      taken.push(box)
      used += units
    }
    return taken
  }

  async function runAllocation(toPlace: Box[], slotId: string) {
    if (toPlace.length === 0) {
      toast.error("That slot doesn't have room for any remaining box")
      return
    }
    try {
      await allocate.mutateAsync({ allocations: toPlace.map((b) => ({ boxId: b.id, slotId })) })
      const placedIds = new Set(toPlace.map((b) => b.id))
      setRemaining((prev) => prev.filter((b) => !placedIds.has(b.id)))
      toast.success(`${toPlace.length} box${toPlace.length === 1 ? "" : "es"} allocated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't allocate")
    }
  }

  /** A suggestion was scored to fit the *entire* current `remaining` batch — place all of it there. */
  function placeSuggestion(slotId: string) {
    void runAllocation(remaining, slotId)
  }

  /** Manual grid click: the slot may only fit part of the remaining batch — fill what fits. */
  function handleSlotClick(slot: Slot) {
    const free = slot.capacity - slot.used
    void runAllocation(takeForCapacity(free), slot.id)
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm tabular-nums">
        {remaining.length} of {boxes.length} box{boxes.length === 1 ? "" : "es"} left to allocate ({unitsFor(remaining)}{" "}
        cm)
      </p>

      {remaining.length === 0 ? (
        <Card>
          <CardContent className="text-status-stored pt-6 text-sm">All boxes allocated.</CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Suggested slots</h2>
            {suggestSlots.isPending && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            )}
            {!suggestSlots.isPending && (suggestSlots.data?.length ?? 0) === 0 && (
              <p className="text-muted-foreground text-sm">
                No single slot fits all {remaining.length} remaining boxes — browse manually below.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {suggestSlots.data?.map((s) => (
                <Card key={s.slotId}>
                  <CardContent className="space-y-2 pt-6">
                    <LocationPath
                      segments={[
                        { label: s.locationPath.warehouse },
                        { label: `Rack ${s.locationPath.rack}` },
                        { label: `Slot ${s.locationPath.slot}` },
                      ]}
                    />
                    <p className="text-muted-foreground text-xs">{s.freeCapacity} cm free after placement</p>
                    <ul className="text-muted-foreground list-inside list-disc text-xs">
                      {s.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <Button size="sm" disabled={allocate.isPending} onClick={() => placeSuggestion(s.slotId)}>
                      Use this slot
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Or browse manually</h2>
            <div className="flex gap-3">
              <Select
                value={warehouseId}
                onValueChange={(v) => {
                  setWarehouseId(v ?? "")
                  setRackId("")
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue
                    placeholder="Warehouse"
                    getLabel={(id) => {
                      const w = warehouses?.find((w) => w.id === id)
                      return w ? `${w.code} — ${w.name}` : id
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {warehouseId && (
                <Select value={rackId} onValueChange={(v) => setRackId(v ?? "")}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Rack" getLabel={(id) => racks?.find((r) => r.id === id)?.label ?? id} />
                  </SelectTrigger>
                  <SelectContent>
                    {racks?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedRack && slots && (
              <div className="space-y-2">
                <div className="max-w-xs">
                  <CapacityBar used={selectedRack.usedCapacity} total={selectedRack.totalCapacity} />
                </div>
                <SlotGrid
                  rows={selectedRack.rows}
                  columns={selectedRack.columns}
                  slots={slots}
                  onSelectSlot={handleSlotClick}
                />
                <SlotGridLegend />
              </div>
            )}
          </section>
        </>
      )}

      <Button
        type="button"
        variant={remaining.length > 0 ? "outline" : "default"}
        onClick={() => onFinish(remaining.length)}
      >
        {remaining.length > 0 ? `Finish (${remaining.length} left unallocated)` : "Finish"}
      </Button>
    </div>
  )
}
