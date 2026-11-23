"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Pencil, Printer } from "@/components/icons"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useBoxSearch } from "@/api/boxes"
import {
  useAddShelf,
  useDeleteRack,
  useRack,
  useRackRowStats,
  useRackSlots,
  useRemoveLastShelf,
  useUpdateRack,
  useUpdateSlot,
  useWarehouse,
  useWarehouseLayout,
} from "@/api/warehouses"
import type { RackRowStats } from "@/api/warehouses"
import type { Box, Rack, Slot } from "@/api/types"
import { checkDimensions, formatCubicFeet, formatVolume, rackShelves, volumeParts, type LengthUnit } from "@/domain/dimensions"
import {
  CellSizeFields,
  checkModuleSize,
  fitModuleSize,
  moduleSizeFromShelves,
  moduleSizeRequest,
  type ModuleSize,
} from "@/staff/features/warehouses/cell-size-fields"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { LOCKED_SLOT_STATUSES, SLOT_LOCK_LABEL, isLockedSlot, type SlotLock } from "@/domain/status"
import { aisleTitle, shelfCode } from "@/domain/location"
import { RackPlacementFields } from "@/staff/features/warehouses/manage-layout-dialog"
import { RackElevation } from "@/staff/features/warehouses/rack-elevation"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const fmt = (n: number) => n.toLocaleString("en-GB")

const LEVEL_FILL = {
  good: "bg-status-stored",
  warning: "bg-status-pending-destruction",
  critical: "bg-status-hold",
} as const

const LEVEL_TEXT = {
  good: "text-foreground",
  warning: "text-status-pending-destruction",
  critical: "text-status-hold",
} as const

const HATCHED = "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_4px,transparent_4px,transparent_8px)]"

// --- Row model -------------------------------------------------------------
// A rack is rows × columns of cells; the page shows one line per ROW (= a shelf; its cells are the positions), adding
// up its cells (e.g. 6 cells × 300 L = 1,800 L). Cells are not shown one by one any more.

interface RackRow {
  row: number
  slots: Slot[]
  used: number
  capacity: number
  fullCells: number
  blockedCells: number
  boxCount: number
  onOrder: boolean
  state: "empty" | "in-use" | "full" | "blocked"
  /** The lock every cell of the row shares (blocked / quarantined / inactive), or undefined if active or mixed. */
  lock?: SlotLock
}

function buildRows(slots: Slot[], stats: RackRowStats[]): RackRow[] {
  const statsByRow = new Map(stats.map((s) => [s.row, s]))
  const byRow = new Map<number, Slot[]>()
  for (const slot of slots) byRow.set(slot.row, [...(byRow.get(slot.row) ?? []), slot])

  return Array.from(byRow.entries())
    .sort(([a], [b]) => a - b)
    .map(([row, rowSlots]) => {
      const used = rowSlots.reduce((sum, s) => sum + s.used, 0)
      const capacity = rowSlots.reduce((sum, s) => sum + s.capacity, 0)
      const blockedCells = rowSlots.filter((s) => isLockedSlot(s.status)).length // locked: no new boxes
      const fullCells = rowSlots.filter((s) => s.status === "full").length
      const rowStats = statsByRow.get(row)
      const usable = rowSlots.length - blockedCells
      const state: RackRow["state"] =
        usable === 0 ? "blocked" : fullCells === usable ? "full" : used > 0 ? "in-use" : "empty"
      const lock =
        rowSlots.every((s) => s.status === rowSlots[0]?.status) && isLockedSlot(rowSlots[0]?.status)
          ? (rowSlots[0].status as SlotLock)
          : undefined
      return {
        row,
        lock,
        slots: rowSlots,
        used,
        capacity,
        fullCells,
        blockedCells,
        boxCount: rowStats?.boxCount ?? 0,
        onOrder: (rowStats?.onOrderCount ?? 0) > 0,
        state,
      }
    })
}

// --- Pieces ----------------------------------------------------------------

/** Horizontal bar for one row: how much of its volume is used. */
function RowBar({
  used,
  capacity,
  blocked,
  className,
}: {
  used: number
  capacity: number
  blocked?: boolean
  className?: string
}) {
  const percent = Math.min(capacityPercent(used, capacity), 100)
  const level = capacityLevel(used, capacity)

  return (
    <div className={cn("bg-muted relative h-3 overflow-hidden rounded-full", blocked && HATCHED, className)}>
      {!blocked && percent > 0 && (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", LEVEL_FILL[level])}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  )
}

/** A small two-or-more-way switch (view / units) in a card header. */
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: [T, string][]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-muted inline-flex rounded-lg p-0.5 text-xs">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "focus-visible:ring-ring rounded-md px-2.5 py-1 font-medium transition-colors outline-none focus-visible:ring-2",
            value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="[--card-spacing:--spacing(5)] justify-between">
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        {children}
      </CardContent>
    </Card>
  )
}

/** The rack's current sizes as form values (cm). */
const rackModuleSize = (rack: Rack): ModuleSize =>
  moduleSizeFromShelves(
    rackShelves(rack),
    { lengthCm: rack.cellLengthCm, heightCm: rack.cellHeightCm, depthCm: rack.cellDepthCm },
    Boolean(rack.variesByShelf),
  )

/** "L×D×H|…" in whole cm per shelf, plus the mode — to tell whether the form changed anything. */
function sizeSignature(size: ModuleSize, unit: LengthUnit, shelfCount: number): string | null {
  const list = size.varies ? fitModuleSize(size, shelfCount).shelves : [size.common]
  const parts: string[] = []
  for (const s of list) {
    const c = checkDimensions(s, unit)
    if (!c.ok) return null
    parts.push(`${c.length}x${c.depth}x${c.height}`)
  }
  return `${size.varies ? "each" : "all"}:${parts.join("|")}`
}

function EditRackDialog({ rack, warehouseId }: { rack: Rack; warehouseId: string }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(rack.label)
  const [placement, setPlacement] = useState({ zoneId: rack.zoneId ?? "", aisleId: rack.aisleId ?? "" })
  const [moduleSize, setModuleSize] = useState<ModuleSize>(rackModuleSize(rack))
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("cm")
  const updateRack = useUpdateRack()
  const { data: layout } = useWarehouseLayout(open ? warehouseId : "")

  const sizeCheck = checkModuleSize(moduleSize, lengthUnit, rack.rows)
  const sizeChanged = sizeSignature(moduleSize, lengthUnit, rack.rows) !== sizeSignature(rackModuleSize(rack), "cm", rack.rows)

  async function save() {
    try {
      await updateRack.mutateAsync({
        rackId: rack.id,
        warehouseId,
        label: label.trim(),
        zoneId: placement.zoneId || null,
        aisleId: placement.aisleId || null,
        ...(sizeChanged && { ...moduleSizeRequest(moduleSize, rack.rows), lengthUnit }),
      })
      toast.success("Module updated")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the module")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setLabel(rack.label)
          setPlacement({ zoneId: rack.zoneId ?? "", aisleId: rack.aisleId ?? "" })
          setModuleSize(rackModuleSize(rack))
          setLengthUnit("cm")
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil className="size-4" aria-hidden />
        Edit module
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {rack.label}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-rack-label">Label</FieldLabel>
            <Input id="edit-rack-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <RackPlacementFields
            layout={layout}
            zoneId={placement.zoneId}
            aisleId={placement.aisleId}
            onChange={setPlacement}
          />
          <CellSizeFields
            idPrefix="edit-cell"
            size={moduleSize}
            unit={lengthUnit}
            onSizeChange={setModuleSize}
            onUnitChange={setLengthUnit}
            shelfCount={rack.rows}
            columns={rack.columns}
            changedHint={
              <>
                {" "}
                {moduleSize.varies
                  ? `Applies to the ${rack.columns} positions of each shelf.`
                  : `Applies to all ${rack.rows * rack.columns} cells of this module.`}
              </>
            }
          />
        </FieldGroup>
        <DialogFooter>
          <Button onClick={save} disabled={!sizeCheck.ok || !label.trim() || updateRack.isPending}>
            {updateRack.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STATE_BADGE: Record<RackRow["state"], { label: string; className: string }> = {
  empty: { label: "Empty", className: "bg-muted text-muted-foreground" },
  "in-use": { label: "In use", className: "bg-status-stored/15 text-status-stored" },
  full: { label: "Full", className: "bg-status-hold/15 text-status-hold" },
  blocked: { label: "Blocked", className: "bg-muted text-muted-foreground" },
}

function SelectedRowPanel({
  row,
  rackCode,
  boxes,
  canManageLayout,
  loadingBoxes,
  onSetLock,
  togglePending,
}: {
  row: RackRow
  rackCode: string
  boxes: Box[]
  canManageLayout: boolean
  loadingBoxes: boolean
  onSetLock: (lock: SlotLock | "active") => void
  togglePending: boolean
}) {
  const percent = capacityPercent(row.used, row.capacity)
  const level = capacityLevel(row.used, row.capacity)
  const badge = row.lock ? { ...STATE_BADGE.blocked, label: SLOT_LOCK_LABEL[row.lock] } : STATE_BADGE[row.state]
  const lockValue = row.lock ?? (row.blockedCells > 0 ? "mixed" : "active")

  return (
    <Card className="[--card-spacing:--spacing(5)] h-full">
      <CardContent className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-muted-foreground text-xs">Selected shelf</p>
            <h2 className="text-xl font-semibold">Shelf {row.row}</h2>
            <p className="text-muted-foreground font-mono text-xs">Code {shelfCode(rackCode, row.row)}</p>
          </div>
          <Badge variant="secondary" className={cn("rounded-full", badge.className)}>
            {badge.label}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("text-4xl font-semibold tabular-nums", LEVEL_TEXT[level])}>
              {percent}
              <span className="text-muted-foreground text-xl">%</span>
            </p>
            <p className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatVolume(row.used)} / {formatVolume(row.capacity)}
            </p>
          </div>
          <RowBar used={row.used} capacity={row.capacity} blocked={row.state === "blocked"} />
        </div>

        <dl className="divide-y border-y text-sm">
          {[
            ["Used", formatVolume(row.used)],
            ["Free", formatVolume(row.state === "blocked" ? 0 : row.capacity - row.used)],
            ["Capacity", formatVolume(row.capacity)],
            ["On an order", row.onOrder ? "Yes" : "No"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2">
          <h3 className="flex items-baseline justify-between text-sm font-semibold">
            Contents
            <span className="text-muted-foreground text-xs font-normal tabular-nums">
              {row.boxCount} box{row.boxCount === 1 ? "" : "es"}
            </span>
          </h3>
          {loadingBoxes ? (
            <Skeleton className="h-16 w-full" />
          ) : boxes.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
              No boxes stored on this shelf yet.
            </div>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
              {boxes.map((box) => (
                <li key={box.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <Link href={`/app/boxes/${box.id}`} className="text-primary font-mono text-xs hover:underline">
                    {box.boxNumber}
                  </Link>
                  <span
                    className="text-muted-foreground min-w-0 truncate text-xs"
                    title={[box.clientName, box.expedienteCode, box.description, box.palletNo && `Pallet ${box.palletNo}`].filter(Boolean).join(" · ")}
                  >
                    {[box.clientName, box.expedienteCode, box.description, box.palletNo && `Pallet ${box.palletNo}`].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {row.boxCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {boxes.length < row.boxCount && <>Showing the first {boxes.length} of {row.boxCount}. </>}
              <Link href={`/app/boxes?module=${encodeURIComponent(rackCode)}&shelf=${row.row}`} className="text-primary hover:underline">
                See {boxes.length < row.boxCount ? "all of them" : "them"} in Find a box
              </Link>
            </p>
          )}
        </div>

        <div className="mt-auto space-y-1.5">
          {canManageLayout && (
            <>
              <p className="text-muted-foreground text-xs">
                Shelf state — locked shelves take no new boxes; boxes inside stay
              </p>
              <Select
                value={lockValue}
                disabled={togglePending}
                onValueChange={(v) => v && v !== "mixed" && onSetLock(v as SlotLock | "active")}
              >
                <SelectTrigger className="w-full" aria-label="Shelf state">
                  <SelectValue
                    getLabel={(v) =>
                      v === "active" ? "Active" : v === "mixed" ? "Mixed" : SLOT_LOCK_LABEL[v as SlotLock]
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  {LOCKED_SLOT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SLOT_LOCK_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Docbox "Fila / Balda" (Nuevo, Borrar): add a shelf on top, remove the last (empty) one, or delete the whole module. */
function ShelfTools({ rack, warehouseId }: { rack: Rack; warehouseId: string }) {
  const router = useRouter()
  const add = useAddShelf()
  const removeLast = useRemoveLastShelf()
  const del = useDeleteRack()
  const busy = add.isPending || removeLast.isPending || del.isPending
  const [ask, setAsk] = useState<"add" | "remove" | "delete" | null>(null)
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "That didn't work")
  // the new shelf copies the top one's size (when sizes vary) — the backend does the same
  const top = rackShelves(rack).at(-1)
  const cellVolume = top ? top.lengthCm * top.heightCm * top.depthCm : rack.cellLengthCm * rack.cellHeightCm * rack.cellDepthCm
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => setAsk("add")}>
        Add shelf
      </Button>
      <Button
        variant="outline"
        disabled={busy || rack.rows <= 1}
        title={rack.rows <= 1 ? "A module needs at least one shelf" : `Removes shelf ${rack.rows} (it must be empty). To take another shelf out of use, set its state to Blocked.`}
        onClick={() => setAsk("remove")}
      >
        Remove last shelf
      </Button>
      <Button
        variant="destructive"
        disabled={busy}
        onClick={() => setAsk("delete")}
      >
        Delete module
      </Button>
      <ConfirmDialog
        open={ask === "add"}
        onOpenChange={(open) => !open && setAsk(null)}
        title={`Add shelf ${rack.rows + 1}?`}
        description={`A new shelf ${rack.rows + 1} will be added on top of ${rack.label}, with ${rack.columns} column${rack.columns === 1 ? "" : "s"} of ${formatVolume(cellVolume)} each (${formatVolume(cellVolume * rack.columns)} more space).`}
        confirmLabel="Add shelf"
        onConfirm={async () => {
          try {
            await add.mutateAsync(rack.id)
            toast.success(`Shelf ${rack.rows + 1} added`)
          } catch (err) {
            fail(err)
          }
        }}
      />
      <ConfirmDialog
        open={ask === "remove"}
        onOpenChange={(open) => !open && setAsk(null)}
        title={`Remove shelf ${rack.rows}?`}
        description={`Shelf ${rack.rows} of ${rack.label} will be removed. It must be empty — move any boxes off it first. To take a different shelf out of use, set its state to Blocked instead.`}
        confirmLabel="Remove shelf"
        onConfirm={async () => {
          try {
            await removeLast.mutateAsync(rack.id)
            toast.success(`Shelf ${rack.rows} removed`)
          } catch (err) {
            fail(err)
          }
        }}
      />
      <ConfirmDialog
        open={ask === "delete"}
        onOpenChange={(open) => !open && setAsk(null)}
        title="Delete this module?"
        description={`${rack.label} (${rack.code}) and all its ${rack.rows} shelves will be deleted. It must hold no boxes. This can't be undone.`}
        confirmLabel="Delete module"
        destructive
        onConfirm={async () => {
          try {
            await del.mutateAsync(rack.id)
            toast.success("Module deleted")
            router.push(`/app/warehouses/${warehouseId}`)
          } catch (err) {
            fail(err)
          }
        }}
      />
    </>
  )
}

// --- Screen ----------------------------------------------------------------

export function RackDetailScreen({ warehouseId, rackId }: { warehouseId: string; rackId: string }) {
  const canManageLayout = useCan("layout.manage")

  const { data: rack, isLoading: loadingRack } = useRack(rackId)
  const { data: warehouse } = useWarehouse(warehouseId)
  const { data: slots, isLoading: loadingSlots, isError } = useRackSlots(rackId)
  // Per-row box counts come from one SQL aggregate; the actual boxes are only fetched for the SELECTED row
  // (first 100, newest first) — never the whole rack at once.
  const { data: rowStats } = useRackRowStats(rackId)
  const updateSlot = useUpdateSlot()

  const [selectedRowNumber, setSelectedRowNumber] = useState(1)
  const [view, setView] = useState<"front" | "list">("front")
  const [drawUnit, setDrawUnit] = useState<LengthUnit>("cm")

  const rows = useMemo(() => buildRows(slots ?? [], rowStats ?? []), [slots, rowStats])
  const selectedRow = rows.find((r) => r.row === selectedRowNumber) ?? rows[0]
  const { data: rowBoxes, isLoading: loadingBoxes } = useBoxSearch(
    { rackId, row: selectedRow?.row, pageSize: 100 },
    { enabled: !!selectedRow },
  )

  const totalUsed = rows.reduce((sum, r) => sum + r.used, 0)
  const totalCapacity = rack?.totalCapacity ?? rows.reduce((sum, r) => sum + r.capacity, 0)
  const rowsInUse = rows.filter((r) => r.used > 0).length
  const fullCells = rows.reduce((sum, r) => sum + r.fullCells, 0)
  const blockedCells = rows.reduce((sum, r) => sum + r.blockedCells, 0)
  // Space that can still take boxes: blocked / locked cells don't count as free (and are listed apart).
  const allSlots = rows.flatMap((r) => r.slots)
  const usableFree = allSlots.reduce((sum, s) => sum + (isLockedSlot(s.status) ? 0 : Math.max(s.capacity - s.used, 0)), 0)
  const lockedCapacity = allSlots.reduce((sum, s) => sum + (isLockedSlot(s.status) ? s.capacity : 0), 0)
  const onOrderRows = rows.filter((r) => r.onOrder).length
  const usedPercent = capacityPercent(totalUsed, totalCapacity)

  // Sets every cell of the row to one state. "active" unlocks (the backend works out available / full itself).
  async function setRowLock(row: RackRow, lock: SlotLock | "active") {
    try {
      await Promise.all(
        row.slots
          .filter((s) => (lock === "active" ? isLockedSlot(s.status) : s.status !== lock))
          .map((s) =>
            updateSlot.mutateAsync({
              slotId: s.id,
              rackId,
              warehouseId,
              status: lock === "active" ? (s.used >= s.capacity ? "full" : "available") : lock,
            }),
          ),
      )
      toast.success(
        lock === "active"
          ? `Shelf ${row.row} is active again`
          : `Shelf ${row.row}: ${SLOT_LOCK_LABEL[lock].toLowerCase()}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the shelf")
    }
  }

  return (
    <div className="max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {loadingRack ? (
          <Skeleton className="h-12 w-64" />
        ) : (
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{rack?.label}</h1>
            {rack && (
              <p className="text-muted-foreground text-sm tabular-nums">
                {warehouse?.site && <>Site {warehouse.site} · </>}
                {warehouse && <>{warehouse.name} · </>}
                {rack.zone && <>Floor {rack.zone.code} · </>}
                {rack.aisle && <>{aisleTitle(rack.aisle, rack.zone).title} · </>}
                {!rack.zone && !rack.aisle && <>No floor or aisle · </>}
                Module code <span className="font-mono">{rack.code}</span> · {rack.rows} shelves × {rack.columns} positions ·{" "}
                {formatVolume(rack.totalCapacity)} total capacity ·{" "}
                {rack.variesByShelf ? (
                  <>shelf sizes vary</>
                ) : (
                  <>
                    each cell {rack.cellLengthCm} × {rack.cellDepthCm} × {rack.cellHeightCm} cm (L × D × H,{" "}
                    {formatVolume(rack.cellLengthCm * rack.cellHeightCm * rack.cellDepthCm)})
                  </>
                )}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {rack && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/print/location-labels?rackId=${rack.id}`} target="_blank" />}
            >
              <Printer className="size-4" aria-hidden />
              Print labels
            </Button>
          )}
          {rack && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/app/boxes?module=${encodeURIComponent(rack.code)}`} />}>
              View boxes
            </Button>
          )}
          {canManageLayout && rack && <EditRackDialog rack={rack} warehouseId={warehouseId} />}
          {canManageLayout && rack && <ShelfTools rack={rack} warehouseId={warehouseId} />}
        </div>
      </div>

      {isError && <p className="text-destructive text-sm">Couldn&apos;t load this module. Try refreshing.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Capacity used">
          <p className="flex items-baseline justify-between gap-2">
            <span>
              <span className="text-3xl font-semibold tabular-nums">{usedPercent}</span>
              <span className="text-muted-foreground ml-0.5 text-lg">%</span>
            </span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatVolume(totalUsed)} / {formatVolume(totalCapacity)}
            </span>
          </p>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", LEVEL_FILL[capacityLevel(totalUsed, totalCapacity)])}
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>
        </StatCard>
        <StatCard label="Free space">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{volumeParts(usableFree).value}</span>
            <span className="text-muted-foreground text-sm">{volumeParts(usableFree).unit}</span>
          </p>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {fmt(usableFree)} cm³ · {formatCubicFeet(usableFree)}
          </p>
          {lockedCapacity > 0 && (
            <p className="text-muted-foreground text-xs">{formatVolume(lockedCapacity)} more is blocked — not counted</p>
          )}
        </StatCard>
        <StatCard label="Shelves in use">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{rowsInUse}</span>
            <span className="text-muted-foreground text-sm">of {rows.length}</span>
          </p>
        </StatCard>
        <StatCard label="Positions and orders">
          <dl className="space-y-1 text-sm">
            {(
              [
                ["Full positions", fullCells],
                ["Blocked positions", blockedCells],
                ["Shelves on an order", onOrderRows],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </StatCard>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="[--card-spacing:--spacing(5)] lg:col-span-2">
          <CardContent className="flex h-full flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">Shelves</h2>
                <Segmented
                  label="Shelves view"
                  value={view}
                  onChange={setView}
                  options={[
                    ["front", "Front view"],
                    ["list", "List"],
                  ]}
                />
                {view === "front" && (
                  <Segmented
                    label="Units in the drawing"
                    value={drawUnit}
                    onChange={setDrawUnit}
                    options={[
                      ["cm", "cm"],
                      ["ft", "ft"],
                    ]}
                  />
                )}
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="border-status-hold size-3 rounded-sm border" /> Full
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("border-border size-3 rounded-sm border", HATCHED)} /> Blocked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-status-reserved size-2 rounded-full" /> On an order
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    <span className="bg-status-stored h-1.5 w-3 rounded-full" />
                    <span className="bg-status-pending-destruction h-1.5 w-3 rounded-full" />
                    <span className="bg-status-hold h-1.5 w-3 rounded-full" />
                  </span>
                  Fill: under 75% · 75–90% · over 90%
                </span>
              </div>
            </div>

            {loadingSlots ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : view === "front" && rack ? (
              <div className="flex flex-1 items-center justify-center">
                <RackElevation
                  shelves={rackShelves(rack)}
                  columns={rack.columns}
                  rows={rows}
                  selectedRow={selectedRow?.row}
                  onSelectRow={setSelectedRowNumber}
                  unit={drawUnit}
                />
              </div>
            ) : (
              <ul className="flex flex-1 flex-col gap-3" aria-label="Shelves">
                {rows.map((row) => {
                  const selected = row.row === selectedRow?.row
                  const percent = capacityPercent(row.used, row.capacity)
                  const level = capacityLevel(row.used, row.capacity)
                  return (
                    <li key={row.row} className="flex flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRowNumber(row.row)}
                        aria-pressed={selected}
                        aria-label={`Shelf ${row.row}, ${percent}% full, ${formatVolume(row.used)} of ${formatVolume(row.capacity)} used`}
                        className={cn(
                          "focus-visible:ring-ring grid min-h-20 w-full grid-cols-[7rem_1fr_9rem] items-center gap-6 rounded-xl border px-5 py-4 text-left transition-colors outline-none focus-visible:ring-2",
                          selected ? "border-primary ring-primary/30 ring-2" : "hover:border-primary/40",
                          row.state === "full" && !selected && "border-status-hold/60",
                          row.state === "blocked" && HATCHED,
                        )}
                      >
                        <span>
                          <span className="flex items-center gap-1.5 font-semibold">
                            Shelf {row.row}
                            {row.onOrder && <span className="bg-status-reserved size-1.5 rounded-full" />}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {formatVolume(row.capacity)}
                          </span>
                        </span>
                        <RowBar used={row.used} capacity={row.capacity} blocked={row.state === "blocked"} />
                        <span className="text-right">
                          <span
                            className={cn("block text-2xl leading-none font-semibold tabular-nums", LEVEL_TEXT[level])}
                          >
                            {row.state === "blocked" ? <span className="text-base">Blocked</span> : percent}
                            {row.state !== "blocked" && <span className="text-muted-foreground text-sm">%</span>}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {formatVolume(row.used)} / {formatVolume(row.capacity)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {selectedRow && (
          <SelectedRowPanel
            key={selectedRow.row}
            row={selectedRow}
            rackCode={rack?.code ?? ""}
            boxes={rowBoxes?.items ?? []}
            canManageLayout={canManageLayout}
            loadingBoxes={loadingBoxes}
            onSetLock={(lock) => setRowLock(selectedRow, lock)}
            togglePending={updateSlot.isPending}
          />
        )}
      </div>
    </div>
  )
}
