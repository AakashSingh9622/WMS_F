"use client"

import { MapPin } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useCreateRack, useWarehouse, useWarehouseRacks } from "@/api/warehouses"
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

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

function AddRackDialog({ warehouseId }: { warehouseId: string }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [rows, setRows] = useState("4")
  const [columns, setColumns] = useState("6")
  const [cellLength, setCellLength] = useState("")
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("ft")
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
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-label">Label</FieldLabel>
            <Input id="rack-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rack A-01" />
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-rows">Rows</FieldLabel>
            <Input id="rack-rows" type="number" min={1} value={rows} onChange={(e) => setRows(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rack-columns">Columns</FieldLabel>
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

export function WarehouseOverviewScreen({ warehouseId }: { warehouseId: string }) {
  const canManageLayout = useCan("layout.manage")
  const { data: warehouse, isLoading: loadingWarehouse } = useWarehouse(warehouseId)
  const { data: racks, isLoading: loadingRacks, isError } = useWarehouseRacks(warehouseId)

  const criticalRacks = racks?.filter((r) => capacityLevel(r.usedCapacity, r.totalCapacity) === "critical") ?? []

  return (
    <div className="space-y-6">
      {loadingWarehouse ? (
        <Skeleton className="h-11 w-72" />
      ) : (
        <PageHeader
          icon={MapPin}
          title={`${warehouse?.code} — ${warehouse?.name}`}
          description={warehouse?.address}
          actions={canManageLayout ? <AddRackDialog warehouseId={warehouseId} /> : undefined}
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

      {racks && racks.length > 0 && (
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
      )}
    </div>
  )
}
