"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  useCreateAisle,
  useCreateZone,
  useDeleteAisle,
  useDeleteZone,
  useUpdateAisle,
  useUpdateZone,
} from "@/api/warehouses"
import type { Aisle, WarehouseLayout, Zone } from "@/api/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NO_ZONE = "__none"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function ZoneSelect({
  zones,
  value,
  onChange,
  label,
}: {
  zones: Zone[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? NO_ZONE)}>
      <SelectTrigger className="w-36" aria-label={label}>
        <SelectValue getLabel={(id) => (id === NO_ZONE ? "No zone" : `Zone ${zones.find((z) => z.id === id)?.code}`)} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ZONE}>No zone</SelectItem>
        {zones.map((z) => (
          <SelectItem key={z.id} value={z.id}>
            Zone {z.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** One zone or aisle: code + name, rename in place, remove (refused while it still has racks). */
function LevelRow({
  item,
  what,
  extra,
  onSave,
  onDelete,
  busy,
}: {
  item: Zone | Aisle
  what: "Zone" | "Aisle"
  extra?: React.ReactNode
  onSave: (input: { code: string; name: string }) => Promise<unknown>
  onDelete: () => void
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(item.code)
  const [name, setName] = useState(item.name ?? "")

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <Input aria-label={`${what} code`} value={code} onChange={(e) => setCode(e.target.value)} className="w-24" />
        <Input
          aria-label={`${what} name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-44"
        />
        <Button
          size="sm"
          disabled={!code.trim() || busy}
          onClick={async () => {
            try {
              await onSave({ code, name })
              setEditing(false)
            } catch (err) {
              onError(err)
            }
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </li>
    )
  }
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="w-28 font-medium">
        {what} {item.code}
      </span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{item.name}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {item.rackCount ?? 0} rack{item.rackCount === 1 ? "" : "s"}
      </span>
      {extra}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setCode(item.code)
          setName(item.name ?? "")
          setEditing(true)
        }}
      >
        Rename
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={onDelete}>
        Remove
      </Button>
    </li>
  )
}

/**
 * Zones and aisles of a warehouse (Sprint 10) — optional; a small warehouse can ignore them. An aisle can sit in a zone
 * or straight in the warehouse. Racks are put in a zone / aisle from the Add / Edit rack dialogs.
 */
export function ManageLayoutDialog({ warehouseId, layout }: { warehouseId: string; layout?: WarehouseLayout }) {
  const [open, setOpen] = useState(false)
  const [zoneCode, setZoneCode] = useState("")
  const [zoneName, setZoneName] = useState("")
  const [aisleCode, setAisleCode] = useState("")
  const [aisleName, setAisleName] = useState("")
  const [aisleZone, setAisleZone] = useState(NO_ZONE)

  const createZone = useCreateZone(warehouseId)
  const updateZone = useUpdateZone(warehouseId)
  const deleteZone = useDeleteZone(warehouseId)
  const createAisle = useCreateAisle(warehouseId)
  const updateAisle = useUpdateAisle(warehouseId)
  const deleteAisle = useDeleteAisle(warehouseId)

  const zones = layout?.zones ?? []
  const aisles = layout?.aisles ?? []

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Zones &amp; aisles</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zones &amp; aisles</DialogTitle>
          <DialogDescription>
            Optional. Group racks into zones and aisles so a location reads “Zone A › Aisle 3 › Rack B04”. Shelves are a
            rack&apos;s rows and positions its cells.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Zones</h3>
          {zones.length === 0 ? (
            <p className="text-muted-foreground text-sm">No zones yet.</p>
          ) : (
            <ul className="divide-y border-y">
              {zones.map((z) => (
                <LevelRow
                  key={z.id}
                  item={z}
                  what="Zone"
                  busy={updateZone.isPending || deleteZone.isPending}
                  onSave={(input) => updateZone.mutateAsync({ id: z.id, ...input })}
                  onDelete={() =>
                    deleteZone.mutate(z.id, { onSuccess: () => toast.success(`Zone ${z.code} removed`), onError })
                  }
                />
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              createZone.mutate(
                { code: zoneCode, name: zoneName || undefined },
                {
                  onSuccess: (z) => {
                    toast.success(`Zone ${z.code} added`)
                    setZoneCode("")
                    setZoneName("")
                  },
                  onError,
                },
              )
            }}
          >
            <Input
              aria-label="New zone code"
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
              placeholder="Code, e.g. A"
              className="w-32"
            />
            <Input
              aria-label="New zone name"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Name (optional)"
              className="w-48"
            />
            <Button type="submit" size="sm" disabled={!zoneCode.trim() || createZone.isPending}>
              Add zone
            </Button>
          </form>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Aisles</h3>
          {aisles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No aisles yet.</p>
          ) : (
            <ul className="divide-y border-y">
              {aisles.map((a) => (
                <LevelRow
                  key={a.id}
                  item={a}
                  what="Aisle"
                  busy={updateAisle.isPending || deleteAisle.isPending}
                  extra={
                    zones.length > 0 && (
                      <ZoneSelect
                        zones={zones}
                        label={`Zone of aisle ${a.code}`}
                        value={a.zoneId ?? NO_ZONE}
                        onChange={(v) =>
                          updateAisle.mutate(
                            { id: a.id, zoneId: v === NO_ZONE ? null : v },
                            {
                              onSuccess: () => toast.success(`Aisle ${a.code} moved — its racks went with it`),
                              onError,
                            },
                          )
                        }
                      />
                    )
                  }
                  onSave={(input) => updateAisle.mutateAsync({ id: a.id, ...input })}
                  onDelete={() =>
                    deleteAisle.mutate(a.id, { onSuccess: () => toast.success(`Aisle ${a.code} removed`), onError })
                  }
                />
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              createAisle.mutate(
                { code: aisleCode, name: aisleName || undefined, zoneId: aisleZone === NO_ZONE ? null : aisleZone },
                {
                  onSuccess: (a) => {
                    toast.success(`Aisle ${a.code} added`)
                    setAisleCode("")
                    setAisleName("")
                  },
                  onError,
                },
              )
            }}
          >
            <Input
              aria-label="New aisle code"
              value={aisleCode}
              onChange={(e) => setAisleCode(e.target.value)}
              placeholder="Code, e.g. 3"
              className="w-32"
            />
            <Input
              aria-label="New aisle name"
              value={aisleName}
              onChange={(e) => setAisleName(e.target.value)}
              placeholder="Name (optional)"
              className="w-48"
            />
            {zones.length > 0 && (
              <ZoneSelect zones={zones} label="Zone of the new aisle" value={aisleZone} onChange={setAisleZone} />
            )}
            <Button type="submit" size="sm" disabled={!aisleCode.trim() || createAisle.isPending}>
              Add aisle
            </Button>
          </form>
        </section>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Zone + aisle pickers for the Add / Edit rack dialogs. Picking an aisle sets its zone; only aisles of the chosen zone
 * (or with no zone) are offered. With no zones or aisles yet it says where to add them.
 */
export function RackPlacementFields({
  layout,
  zoneId,
  aisleId,
  onChange,
}: {
  layout?: WarehouseLayout
  zoneId: string
  aisleId: string
  onChange: (next: { zoneId: string; aisleId: string }) => void
}) {
  const zones = layout?.zones ?? []
  const aisles = (layout?.aisles ?? []).filter((a) => (zoneId ? a.zoneId === zoneId : true))
  if (!zones.length && !layout?.aisles.length) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
        <span className="text-foreground font-medium">Zone / aisle:</span> this warehouse has none yet. They&apos;re
        optional — add them with <span className="text-foreground font-medium">Zones &amp; aisles</span> on the
        warehouse page, then pick them here.
      </p>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {zones.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Zone</p>
          <ZoneSelect
            zones={zones}
            label="Zone"
            value={zoneId || NO_ZONE}
            onChange={(v) => {
              const z = v === NO_ZONE ? "" : v
              const keep = layout?.aisles.find((a) => a.id === aisleId)?.zoneId === (z || undefined)
              onChange({ zoneId: z, aisleId: keep ? aisleId : "" })
            }}
          />
        </div>
      )}
      {(layout?.aisles.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Aisle</p>
          <Select
            value={aisleId || NO_ZONE}
            onValueChange={(v) => {
              const a = v && v !== NO_ZONE ? layout?.aisles.find((x) => x.id === v) : undefined
              onChange({ zoneId: a ? (a.zoneId ?? "") : zoneId, aisleId: a?.id ?? "" })
            }}
          >
            <SelectTrigger className="w-36" aria-label="Aisle">
              <SelectValue
                getLabel={(id) =>
                  id === NO_ZONE ? "No aisle" : `Aisle ${layout?.aisles.find((a) => a.id === id)?.code ?? ""}`
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ZONE}>No aisle</SelectItem>
              {aisles.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  Aisle {a.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
