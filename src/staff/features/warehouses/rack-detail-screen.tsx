"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Pencil } from "@/components/icons"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useBoxSearch } from "@/api/boxes"
import { useRack, useRackRowStats, useRackSlots, useUpdateRack, useUpdateSlot } from "@/api/warehouses"
import type { RackRowStats } from "@/api/warehouses"
import type { Box, Rack, Slot } from "@/api/types"
import { formatLength, toCentimetres, type LengthUnit } from "@/domain/dimensions"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { LOCKED_SLOT_STATUSES, SLOT_LOCK_LABEL, isLockedSlot, type SlotLock } from "@/domain/status"
import { cn } from "@/lib/utils"
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
// A rack is rows × columns of cells; the page shows one line per ROW, adding up its cells
// (e.g. 6 cells × 366 cm = 2,196 cm). Cells are not shown one by one any more.

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

/** Horizontal bar for one row, with a tick every metre so the row's real length can be read off it. */
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
  const tickPercent = capacity > 0 ? (100 / capacity) * 100 : 100 // 100 cm = 1 m, as a % of the row length

  return (
    <div className={cn("bg-muted relative h-3 overflow-hidden rounded-full", blocked && HATCHED, className)}>
      {!blocked && percent > 0 && (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", LEVEL_FILL[level])}
          style={{ width: `${percent}%` }}
        />
      )}
      {!blocked && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${tickPercent}% - 1px), color-mix(in oklab, var(--border) 90%, transparent) calc(${tickPercent}% - 1px), color-mix(in oklab, var(--border) 90%, transparent) ${tickPercent}%)`,
          }}
        />
      )}
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

function EditRackDialog({ rack, warehouseId }: { rack: Rack; warehouseId: string }) {
  const [open, setOpen] = useState(false)
  const [cellLength, setCellLength] = useState(String(rack.cellLengthCm))
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("cm")
  const updateRack = useUpdateRack()

  const lengthCm = Number(cellLength) > 0 ? toCentimetres(Number(cellLength), lengthUnit) : 0

  async function save() {
    try {
      await updateRack.mutateAsync({ rackId: rack.id, warehouseId, cellLength: Number(cellLength), lengthUnit })
      toast.success("Rack updated")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the rack")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setCellLength(String(rack.cellLengthCm))
          setLengthUnit("cm")
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil className="size-4" aria-hidden />
        Edit rack
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {rack.label}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-cell-length">Length of one cell</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="edit-cell-length"
                type="number"
                min={0}
                step="any"
                value={cellLength}
                onChange={(e) => setCellLength(e.target.value)}
              />
              <Select value={lengthUnit} onValueChange={(v) => setLengthUnit((v as LengthUnit) ?? "cm")}>
                <SelectTrigger className="w-24" aria-label="Length unit">
                  <SelectValue getLabel={(v) => (v === "ft" ? "feet" : "cm")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="ft">feet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-xs">
              Applies to all {rack.rows * rack.columns} cells of this rack. Feet are converted to centimetres and saved.
              {lengthCm > 0 && (
                <span className="text-foreground tabular-nums">
                  {" "}
                  = {formatLength(lengthCm)} per cell · {fmt(lengthCm * rack.rows * rack.columns)} cm in total
                </span>
              )}
            </p>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={save} disabled={lengthCm <= 0 || updateRack.isPending}>
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
  boxes,
  canManageLayout,
  loadingBoxes,
  onSetLock,
  togglePending,
}: {
  row: RackRow
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
            <p className="text-muted-foreground text-xs">Selected row</p>
            <h2 className="text-xl font-semibold">Row {row.row}</h2>
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
              {fmt(row.used)} / {fmt(row.capacity)} cm
            </p>
          </div>
          <RowBar used={row.used} capacity={row.capacity} blocked={row.state === "blocked"} />
        </div>

        <dl className="divide-y border-y text-sm">
          {[
            ["Used", `${fmt(row.used)} cm`],
            ["Free", `${fmt(row.state === "blocked" ? 0 : row.capacity - row.used)} cm`],
            ["Capacity", `${fmt(row.capacity)} cm`],
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
              No boxes stored on this row yet.
            </div>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
              {boxes.map((box) => (
                <li key={box.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <Link href={`/app/boxes/${box.id}`} className="text-primary font-mono text-xs hover:underline">
                    {box.boxNumber}
                  </Link>
                  <span className="text-muted-foreground min-w-0 truncate text-xs">{box.clientName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto space-y-1.5">
          {canManageLayout && (
            <>
              <p className="text-muted-foreground text-xs">
                Row state — locked rows take no new boxes; boxes inside stay
              </p>
              <Select
                value={lockValue}
                disabled={togglePending}
                onValueChange={(v) => v && v !== "mixed" && onSetLock(v as SlotLock | "active")}
              >
                <SelectTrigger className="w-full" aria-label="Row state">
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

// --- Screen ----------------------------------------------------------------

export function RackDetailScreen({ warehouseId, rackId }: { warehouseId: string; rackId: string }) {
  const canManageLayout = useCan("layout.manage")

  const { data: rack, isLoading: loadingRack } = useRack(rackId)
  const { data: slots, isLoading: loadingSlots, isError } = useRackSlots(rackId)
  // Per-row box counts come from one SQL aggregate; the actual boxes are only fetched for the SELECTED row
  // (first 100, newest first) — never the whole rack at once.
  const { data: rowStats } = useRackRowStats(rackId)
  const updateSlot = useUpdateSlot()

  const [selectedRowNumber, setSelectedRowNumber] = useState(1)

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
        lock === "active" ? `Row ${row.row} is active again` : `Row ${row.row}: ${SLOT_LOCK_LABEL[lock].toLowerCase()}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the row")
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
                {rack.rows} rows × {rack.columns} columns · {fmt(rack.totalCapacity)} cm total capacity · each cell{" "}
                {formatLength(rack.cellLengthCm)}
              </p>
            )}
          </div>
        )}
        {canManageLayout && rack && <EditRackDialog rack={rack} warehouseId={warehouseId} />}
      </div>

      {isError && <p className="text-destructive text-sm">Couldn&apos;t load this rack. Try refreshing.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Capacity used">
          <p className="flex items-baseline justify-between gap-2">
            <span>
              <span className="text-3xl font-semibold tabular-nums">{usedPercent}</span>
              <span className="text-muted-foreground ml-0.5 text-lg">%</span>
            </span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {fmt(totalUsed)} / {fmt(totalCapacity)} cm
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
            <span className="text-3xl font-semibold tabular-nums">{fmt(Math.max(totalCapacity - totalUsed, 0))}</span>
            <span className="text-muted-foreground text-sm">cm</span>
          </p>
        </StatCard>
        <StatCard label="Rows in use">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{rowsInUse}</span>
            <span className="text-muted-foreground text-sm">of {rows.length}</span>
          </p>
        </StatCard>
        <StatCard label="Full · Blocked · On order">
          <p className="text-3xl font-semibold tabular-nums">
            {fullCells} · {blockedCells} · {onOrderRows}
          </p>
        </StatCard>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="[--card-spacing:--spacing(5)] lg:col-span-2">
          <CardContent className="flex h-full flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Rows</h2>
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
                <span className="border-l pl-3">Tick = 1 m</span>
              </div>
            </div>

            {loadingSlots ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <ul className="flex flex-1 flex-col gap-3" aria-label="Rack rows">
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
                        aria-label={`Row ${row.row}, ${percent}% full, ${row.used} of ${row.capacity} cm used`}
                        className={cn(
                          "focus-visible:ring-ring grid min-h-20 w-full grid-cols-[7rem_1fr_9rem] items-center gap-6 rounded-xl border px-5 py-4 text-left transition-colors outline-none focus-visible:ring-2",
                          selected ? "border-primary ring-primary/30 ring-2" : "hover:border-primary/40",
                          row.state === "full" && !selected && "border-status-hold/60",
                          row.state === "blocked" && HATCHED,
                        )}
                      >
                        <span>
                          <span className="flex items-center gap-1.5 font-semibold">
                            Row {row.row}
                            {row.onOrder && <span className="bg-status-reserved size-1.5 rounded-full" />}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {fmt(row.capacity)} cm
                          </span>
                        </span>
                        <RowBar used={row.used} capacity={row.capacity} blocked={row.state === "blocked"} />
                        <span className="text-right">
                          <span
                            className={cn("block text-2xl leading-none font-semibold tabular-nums", LEVEL_TEXT[level])}
                          >
                            {row.state === "blocked" ? "—" : percent}
                            {row.state !== "blocked" && <span className="text-muted-foreground text-sm">%</span>}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {fmt(row.used)} / {fmt(row.capacity)} cm
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
