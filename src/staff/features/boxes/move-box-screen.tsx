"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useBox, useAllocateBoxes, useSuggestSlots } from "@/api/boxes"
import { useWarehouses, useWarehouseRacks, useRackSlots } from "@/api/warehouses"
import { SlotGrid, SlotGridLegend } from "@/components/slot-grid"
import { LocationPath } from "@/components/location-path"
import { CapacityBar } from "@/components/capacity-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { Slot } from "@/api/types"

export function MoveBoxScreen({ boxId }: { boxId: string }) {
  const router = useRouter()
  const { data: box, isLoading } = useBox(boxId)
  const [reason, setReason] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [rackId, setRackId] = useState("")

  const suggestSlots = useSuggestSlots()
  const allocate = useAllocateBoxes()
  const { data: warehouses } = useWarehouses()
  const { data: racks } = useWarehouseRacks(warehouseId)
  const { data: slots } = useRackSlots(rackId)
  const selectedRack = racks?.find((r) => r.id === rackId)

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
    void moveTo(slot.id)
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!box) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Move {box.boxNumber}</h1>
        {box.locationPath && (
          <p className="text-muted-foreground text-sm">
            Currently in{" "}
            <LocationPath
              segments={[
                { label: box.locationPath.warehouse },
                { label: `Rack ${box.locationPath.rack}` },
                { label: `Slot ${box.locationPath.slot}` },
              ]}
            />
          </p>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="move-reason">Reason for the move (required)</FieldLabel>
        <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" />
      </Field>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Suggested slots</h2>
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
              selectedSlotId={box.slotId}
              onSelectSlot={handleSlotClick}
            />
            <SlotGridLegend />
          </div>
        )}
      </section>
    </div>
  )
}
