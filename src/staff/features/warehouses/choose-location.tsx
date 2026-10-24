"use client"

import { useState } from "react"

import { lookupLocation, useRackSearch, useRackSlots, useWarehouseLayout, useWarehouses } from "@/api/warehouses"
import type { LocationLookup, RackMatch, Slot } from "@/api/types"
import { useDebounce } from "@/hooks/useDebounce"
import { CapacityBar } from "@/components/capacity-bar"
import { LocationPath } from "@/components/location-path"
import { SlotGrid, SlotGridLegend } from "@/components/slot-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isLockedSlot } from "@/domain/status"
import { cn } from "@/lib/utils"

const ALL = "__all"
const NONE = "__none"

type Found = Extract<LocationLookup, { kind: "position" | "shelf" | "rack" }>

/**
 * Two ways to choose where a box goes (Sprint 10): type / scan a code — "B04-3" picks the best-fitting position on that
 * shelf, "B04-3-2" one position — which also fills in the browse lists below; or browse warehouse → zone → aisle →
 * rack and click a position. Zone and aisle lists only appear when the warehouse has them.
 */
export function ChooseLocation({
  needCm,
  selectedSlotId,
  disabled,
  pickLabel = "Use this position",
  onPick,
}: {
  /** cm the box(es) need — the shelf lookup suggests the position that fits it best. */
  needCm: number
  /** Highlighted in the grid (e.g. the box's current position when moving). */
  selectedSlotId?: string
  disabled?: boolean
  pickLabel?: string
  onPick: (slot: Slot) => void | Promise<unknown>
}) {
  const [code, setCode] = useState("")
  const [result, setResult] = useState<LocationLookup | null>(null)
  const [looking, setLooking] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [showMatches, setShowMatches] = useState(false)

  const [warehouseId, setWarehouseId] = useState("")
  const [zoneId, setZoneId] = useState(ALL)
  const [aisleId, setAisleId] = useState(ALL)
  const [rackId, setRackId] = useState("")

  const { data: warehouses } = useWarehouses()
  const { data: layout } = useWarehouseLayout(warehouseId)
  const { data: slots } = useRackSlots(rackId)

  const zones = layout?.zones ?? []
  const aislesInZone = (layout?.aisles ?? []).filter((a) =>
    zoneId === ALL ? true : zoneId === NONE ? !a.zoneId : a.zoneId === zoneId,
  )
  const racks = (layout?.racks ?? []).filter(
    (r) =>
      (zoneId === ALL || (zoneId === NONE ? !r.zoneId : r.zoneId === zoneId)) &&
      (aisleId === ALL || (aisleId === NONE ? !r.aisleId : r.aisleId === aisleId)),
  )
  const selectedRack = layout?.racks.find((r) => r.id === rackId)

  // Search-as-you-type: racks whose code or NAME match (people remember the name the dropdowns show).
  const searchText = useDebounce(code, 200)
  const { data: matches } = useRackSearch(showMatches ? searchText : "")

  async function find(text = code, scope: { warehouseId?: string; rackId?: string } = {}) {
    const c = text.trim()
    if (!c) return
    setShowMatches(false)
    setLooking(true)
    try {
      const r = await lookupLocation(c, { needCm, ...scope })
      setResult(r)
      if (r.kind === "position" || r.kind === "shelf" || r.kind === "rack") {
        setChosenId(r.kind === "position" ? r.positions[0].id : r.suggestedSlotId)
        // fill in the tree so the grid below shows the same rack
        setWarehouseId(r.warehouse.id)
        setZoneId(r.zone?.id ?? ALL)
        setAisleId(r.aisle?.id ?? ALL)
        setRackId(r.rack.id)
      }
    } catch (err) {
      setResult({
        kind: "not_found",
        code: c,
        message: err instanceof Error ? err.message : "Lookup failed",
        suggestions: [],
      })
    } finally {
      setLooking(false)
    }
  }

  async function pick(slot: Slot) {
    await onPick(slot)
    if (result && result.kind !== "not_found" && result.kind !== "ambiguous")
      void find(result.code, { rackId: result.rack.id })
  }

  /** A rack picked from the matches: keep any shelf / position numbers already typed after the name. */
  function chooseMatch(m: RackMatch) {
    const numbers = code.trim().match(/(?:[\s\-/.]+\d+){1,2}$/)?.[0] ?? ""
    const next = m.rackCode + numbers.replace(/[\s\-/.]+/g, "-")
    setCode(next)
    void find(next, { rackId: m.rackId })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Find a rack, shelf or position</h2>
          <p className="text-muted-foreground text-xs">
            Type the rack&apos;s name or code, then the shelf (and position) number — e.g. “Rack A-01 3”, B04-3 or
            B04-3-2.
          </p>
        </div>
        <form
          className="relative flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void find()
          }}
        >
          <div className="relative flex-1">
            <Input
              aria-label="Rack name or code, shelf, position"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setShowMatches(true)
              }}
              onFocus={() => setShowMatches(true)}
              onBlur={() => setTimeout(() => setShowMatches(false), 150)}
              onKeyDown={(e) => e.key === "Escape" && setShowMatches(false)}
              placeholder="Rack name or code, e.g. Rack A-01 3"
              autoComplete="off"
              role="combobox"
              aria-expanded={showMatches && !!matches?.length}
              aria-controls="rack-matches"
            />
            {showMatches && code.trim() && matches && matches.length > 0 && (
              <ul
                id="rack-matches"
                role="listbox"
                className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-md"
              >
                {matches.map((m) => (
                  <li key={m.rackId} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close first
                      onClick={() => chooseMatch(m)}
                      className="hover:bg-accent flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{m.rackLabel}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{m.rackCode}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {[m.warehouseCode, m.zone && `Zone ${m.zone}`, m.aisle && `Aisle ${m.aisle}`]
                          .filter(Boolean)
                          .join(" › ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="submit" variant="outline" disabled={!code.trim() || looking}>
            {looking ? "Finding…" : "Find"}
          </Button>
        </form>
        {result && (
          <LookupResult
            result={result}
            chosenId={chosenId}
            onChoose={setChosenId}
            onRetry={(c, scope) => {
              setCode(c)
              void find(c, scope)
            }}
            needCm={needCm}
            disabled={disabled}
            pickLabel={pickLabel}
            onPick={pick}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Or browse</h2>
        <div className="flex flex-wrap gap-3">
          <Select
            value={warehouseId}
            onValueChange={(v) => {
              setWarehouseId(v ?? "")
              setZoneId(ALL)
              setAisleId(ALL)
              setRackId("")
            }}
          >
            <SelectTrigger className="w-56" aria-label="Warehouse">
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

          {zones.length > 0 && (
            <Select
              value={zoneId}
              onValueChange={(v) => {
                setZoneId(v ?? ALL)
                setAisleId(ALL)
                setRackId("")
              }}
            >
              <SelectTrigger className="w-44" aria-label="Zone">
                <SelectValue
                  getLabel={(id) =>
                    id === ALL ? "All zones" : id === NONE ? "No zone" : `Zone ${zones.find((z) => z.id === id)?.code}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    Zone {z.code}
                    {z.name ? ` — ${z.name}` : ""}
                  </SelectItem>
                ))}
                {layout?.racks.some((r) => !r.zoneId) && <SelectItem value={NONE}>No zone</SelectItem>}
              </SelectContent>
            </Select>
          )}

          {aislesInZone.length > 0 && (
            <Select
              value={aisleId}
              onValueChange={(v) => {
                setAisleId(v ?? ALL)
                setRackId("")
              }}
            >
              <SelectTrigger className="w-44" aria-label="Aisle">
                <SelectValue
                  getLabel={(id) =>
                    id === ALL
                      ? "All aisles"
                      : id === NONE
                        ? "No aisle"
                        : `Aisle ${layout?.aisles.find((a) => a.id === id)?.code}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All aisles</SelectItem>
                {aislesInZone.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    Aisle {a.code}
                    {a.name ? ` — ${a.name}` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NONE}>No aisle</SelectItem>
              </SelectContent>
            </Select>
          )}

          {warehouseId && (
            <Select value={rackId} onValueChange={(v) => setRackId(v ?? "")}>
              <SelectTrigger className="w-56" aria-label="Rack">
                <SelectValue
                  placeholder={racks.length ? "Rack" : "No racks here"}
                  getLabel={(id) => layout?.racks.find((r) => r.id === id)?.label ?? id}
                />
              </SelectTrigger>
              <SelectContent>
                {racks.map((r) => (
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
            <p className="text-muted-foreground text-xs">Rows are shelves 1–{selectedRack.rows}, top to bottom.</p>
            <SlotGrid
              rows={selectedRack.rows}
              columns={selectedRack.columns}
              slots={slots}
              selectedSlotId={selectedSlotId}
              onSelectSlot={disabled ? undefined : (slot) => void pick(slot)}
            />
            <SlotGridLegend />
          </div>
        )}
      </section>
    </div>
  )
}

function LookupResult({
  result,
  chosenId,
  onChoose,
  onRetry,
  needCm,
  disabled,
  pickLabel,
  onPick,
}: {
  result: LocationLookup
  chosenId: string | null
  onChoose: (id: string) => void
  onRetry: (code: string, scope?: { rackId?: string }) => void
  needCm: number
  disabled?: boolean
  pickLabel: string
  onPick: (slot: Slot) => void
}) {
  if (result.kind === "not_found") {
    return (
      <div className="text-sm">
        <p className="text-destructive">{result.message}</p>
        {result.suggestions.length > 0 && (
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1">
            Did you mean
            {result.suggestions.map((s) => (
              <Button key={s} size="xs" variant="outline" className="font-mono" onClick={() => onRetry(s)}>
                {s}
              </Button>
            ))}
          </p>
        )}
      </div>
    )
  }
  if (result.kind === "ambiguous") {
    return (
      <div className="space-y-2 text-sm">
        <p>{result.message}</p>
        <div className="flex flex-wrap gap-2">
          {result.choices.map((c) => (
            <Button
              key={c.rackId}
              size="sm"
              variant="outline"
              onClick={() => onRetry(result.code, { rackId: c.rackId })}
            >
              {[c.warehouseCode, c.zone && `Zone ${c.zone}`, c.aisle && `Aisle ${c.aisle}`].filter(Boolean).join(" › ")}{" "}
              › {c.rackLabel} <span className="text-muted-foreground font-mono text-xs">{c.rackCode}</span>
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const found: Found = result
  const segments = [
    found.warehouse.code,
    ...(found.zone ? [`Zone ${found.zone.code}`] : []),
    ...(found.aisle ? [`Aisle ${found.aisle.code}`] : []),
    found.rack.label === found.rack.code ? `Rack ${found.rack.code}` : `${found.rack.label} (${found.rack.code})`,
    ...(found.shelf != null ? [`Shelf ${found.shelf}`] : []),
  ]
  if (found.kind === "rack") {
    return (
      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <LocationPath segments={segments.map((label) => ({ label }))} />
          <p className="text-muted-foreground text-xs">
            Add the shelf number to pick a position — e.g. {found.rack.code}-1 (shelves 1–{found.rack.rows}) — or click
            one in the grid below.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chosen = found.positions.find((p) => p.id === chosenId)
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <LocationPath segments={segments.map((label) => ({ label }))} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Positions on this shelf">
          {found.positions.map((p) => {
            const free = isLockedSlot(p.status) ? 0 : p.capacity - p.used
            const usable = !isLockedSlot(p.status) && free > 0
            return (
              <button
                key={p.id}
                type="button"
                disabled={!usable}
                aria-pressed={p.id === chosenId}
                onClick={() => onChoose(p.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
                  p.id === chosenId ? "border-primary ring-primary/30 ring-2" : "hover:border-primary/40",
                )}
              >
                <span className="block font-medium">Position {p.column}</span>
                <span className="text-muted-foreground tabular-nums">
                  {isLockedSlot(p.status) ? p.status : `${free} cm free`}
                  {p.id === found.suggestedSlotId && " · best fit"}
                </span>
              </button>
            )
          })}
        </div>
        {!found.suggestedSlotId && (
          <p className="text-muted-foreground text-xs">
            {found.kind === "position" ? "This position doesn't" : "No position on this shelf"} has {needCm} cm free —
            choose one to fill what fits, or try another shelf.
          </p>
        )}
        <Button size="sm" disabled={!chosen || disabled} onClick={() => chosen && onPick(chosen)}>
          {chosen ? `${pickLabel} (position ${chosen.column})` : pickLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
