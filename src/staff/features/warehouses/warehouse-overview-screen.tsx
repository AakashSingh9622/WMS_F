"use client"

import { MapPin } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useCreateRack, useWarehouse, useWarehouseLayout } from "@/api/warehouses"
import type { Rack, WarehouseLayout } from "@/api/types"
import { CapacityBar } from "@/components/capacity-bar"
import { capacityLevel } from "@/lib/capacity"
import { formatLength, toCentimetres, type LengthUnit } from "@/domain/dimensions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ManageLayoutDialog, RackPlacementFields } from "@/staff/features/warehouses/manage-layout-dialog"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function AddRackDialog({ warehouseId, layout }: { warehouseId: string; layout?: WarehouseLayout }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [rows, setRows] = useState("4")
  const [columns, setColumns] = useState("6")
  const [cellLength, setCellLength] = useState("")
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("ft")
  const [placement, setPlacement] = useState({ zoneId: "", aisleId: "" })
  const createRack = useCreateRack()

  const lengthCm = Number(cellLength) > 0 ? toCentimetres(Number(cellLength), lengthUnit) : 0
  const cellCount = (Number(rows) || 0) * (Number(columns) || 0)

  async function submit() {
    try {
      await createRack.mutateAsync({
        warehouseId,
        code,
        label,
        rows: Number(rows) || 1,
        columns: Number(columns) || 1,
        cellLength: Number(cellLength),
        lengthUnit,
        zoneId: placement.zoneId || undefined,
        aisleId: placement.aisleId || undefined,
      })
      toast.success("Rack added")
      setOpen(false)
      setCode("")
      setLabel("")
      setCellLength("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Add rack</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rack</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rack-code">Code</FieldLabel>
            <Input id="rack-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A01" />
            <p className="text-muted-foreground text-xs">
              Unique across all warehouses — staff type it to find a shelf, e.g. {code.trim() || "A01"}-2.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-label">Label</FieldLabel>
            <Input id="rack-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rack A-01" />
          </Field>
          <RackPlacementFields
            layout={layout}
            zoneId={placement.zoneId}
            aisleId={placement.aisleId}
            onChange={setPlacement}
          />
          <Field>
            <FieldLabel htmlFor="rack-rows">Shelves (rows)</FieldLabel>
            <Input id="rack-rows" type="number" min={1} value={rows} onChange={(e) => setRows(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-columns">Positions per shelf (columns)</FieldLabel>
            <Input
              id="rack-columns"
              type="number"
              min={1}
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-cell-length">Length of one cell</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="rack-cell-length"
                type="number"
                min={0}
                step="any"
                value={cellLength}
                onChange={(e) => setCellLength(e.target.value)}
                placeholder="e.g. 4"
              />
              <Select value={lengthUnit} onValueChange={(v) => setLengthUnit((v as LengthUnit) ?? "ft")}>
                <SelectTrigger className="w-24" aria-label="Length unit">
                  <SelectValue getLabel={(v) => (v === "cm" ? "cm" : "feet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="ft">feet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-xs">
              Each row × column cell is one storage location of this length (not split into smaller slots). Feet are
              converted to centimetres and saved.
              {lengthCm > 0 && (
                <>
                  {" "}
                  <span className="text-foreground tabular-nums">
                    = {formatLength(lengthCm)} per cell · {cellCount} cells · {(lengthCm * cellCount).toLocaleString()}{" "}
                    cm total
                  </span>
                </>
              )}
            </p>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!code || !label || lengthCm <= 0 || createRack.isPending}>
            {createRack.isPending ? "Adding…" : "Add rack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RackCards({ racks, warehouseId }: { racks: Rack[]; warehouseId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {racks.map((rack) => {
        const level = capacityLevel(rack.usedCapacity, rack.totalCapacity)
        return (
          <Link key={rack.id} href={`/app/warehouses/${warehouseId}/racks/${rack.id}`}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  {rack.label}
                  {level === "critical" && (
                    <Badge variant="outline" className="border-status-hold text-status-hold">
                      Full
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CapacityBar used={rack.usedCapacity} total={rack.totalCapacity} />
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

interface Group {
  key: string
  title: string
  name?: string
  used?: number
  total?: number
  racks: Rack[]
  depth: 0 | 1
}

/**
 * Racks grouped zone → aisle (aisles without a zone after the zones, racks with neither last). With no zones or aisles
 * at all it is just one list, as before.
 */
function groupRacks(layout: WarehouseLayout): Group[] {
  const groups: Group[] = []
  const aisleGroup = (a: WarehouseLayout["aisles"][number], depth: 0 | 1): Group => ({
    key: a.id,
    title: `Aisle ${a.code}`,
    name: a.name,
    used: a.usedCapacity,
    total: a.totalCapacity,
    racks: layout.racks.filter((r) => r.aisleId === a.id),
    depth,
  })
  for (const z of layout.zones) {
    groups.push({
      key: z.id,
      title: `Zone ${z.code}`,
      name: z.name,
      used: z.usedCapacity,
      total: z.totalCapacity,
      racks: layout.racks.filter((r) => r.zoneId === z.id && !r.aisleId),
      depth: 0,
    })
    for (const a of layout.aisles.filter((x) => x.zoneId === z.id)) groups.push(aisleGroup(a, 1))
  }
  for (const a of layout.aisles.filter((x) => !x.zoneId)) groups.push(aisleGroup(a, 0))
  const loose = layout.racks.filter((r) => !r.zoneId && !r.aisleId)
  if (loose.length) groups.push({ key: "none", title: "No zone or aisle", racks: loose, depth: 0 })
  return groups
}

export function WarehouseOverviewScreen({ warehouseId }: { warehouseId: string }) {
  const canManageLayout = useCan("layout.manage")
  const { data: warehouse, isLoading: loadingWarehouse } = useWarehouse(warehouseId)
  const { data: layout, isLoading: loadingRacks, isError } = useWarehouseLayout(warehouseId)
  const racks = layout?.racks

  const criticalRacks = racks?.filter((r) => capacityLevel(r.usedCapacity, r.totalCapacity) === "critical") ?? []
  const grouped = layout && (layout.zones.length > 0 || layout.aisles.length > 0)

  return (
    <div className="space-y-6">
      {loadingWarehouse ? (
        <Skeleton className="h-11 w-72" />
      ) : (
        <PageHeader
          icon={MapPin}
          title={`${warehouse?.code} — ${warehouse?.name}`}
          description={warehouse?.address}
          actions={
            canManageLayout ? (
              <div className="flex gap-2">
                <ManageLayoutDialog warehouseId={warehouseId} layout={layout} />
                <AddRackDialog warehouseId={warehouseId} layout={layout} />
              </div>
            ) : undefined
          }
        />
      )}

      {warehouse && (
        <Card>
          <CardContent className="pt-6">
            <CapacityBar used={warehouse.usedCapacity} total={warehouse.totalCapacity} />
            {criticalRacks.length > 0 && (
              <p className="text-status-hold mt-2 text-sm">
                {criticalRacks.length} rack{criticalRacks.length === 1 ? "" : "s"} over 90% full.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {loadingRacks && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {isError && <p className="text-destructive text-sm">Couldn&apos;t load racks. Try refreshing.</p>}

      {racks && racks.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No racks yet. {canManageLayout ? "Use “Add rack” above to create one." : "Ask an admin to add one."}
        </p>
      )}

      {racks && racks.length > 0 && !grouped && <RackCards racks={racks} warehouseId={warehouseId} />}

      {grouped &&
        groupRacks(layout).map((g) => (
          <section key={g.key} className={g.depth === 1 ? "space-y-3 border-l pl-4" : "space-y-3"}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={g.depth === 1 ? "text-sm font-semibold" : "text-base font-semibold"}>
                {g.title}
                {g.name && <span className="text-muted-foreground ml-2 font-normal">{g.name}</span>}
              </h2>
              {g.total ? (
                <div className="w-56">
                  <CapacityBar used={g.used ?? 0} total={g.total} />
                </div>
              ) : null}
            </div>
            {g.racks.length > 0 ? (
              <RackCards racks={g.racks} warehouseId={warehouseId} />
            ) : g.title.startsWith("Aisle") ? (
              <p className="text-muted-foreground text-xs">No racks in this aisle yet.</p>
            ) : null}
          </section>
        ))}
    </div>
  )
}
