"use client"

import { MapPin, Search } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Warehouse as WarehouseIcon } from "@/components/icons"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useBoxSearch } from "@/api/boxes"
import { useCreateWarehouse, useWarehouses } from "@/api/warehouses"
import type { Warehouse } from "@/api/types"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { formatVolume } from "@/domain/dimensions"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useSites } from "@/api/sites"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

// Same rule as the backend: names (and codes) are compared ignoring case and extra spaces.
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()

function AddWarehouseDialog({ existing }: { existing: Warehouse[] }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [site, setSite] = useState("")
  const { data: sites } = useSites()
  const [serverError, setServerError] = useState<string | null>(null)
  const createWarehouse = useCreateWarehouse()
  const router = useRouter()

  // Instant check against the warehouses already loaded; the server repeats it (and wins any race).
  const nameTaken = useMemo(() => {
    const wanted = normalize(name)
    return wanted !== "" && existing.some((w) => normalize(w.name) === wanted)
  }, [name, existing])
  const codeTaken = useMemo(() => {
    const wanted = normalize(code)
    return wanted !== "" && existing.some((w) => normalize(w.code) === wanted)
  }, [code, existing])
  const nameError = nameTaken ? `A warehouse named "${name.trim()}" already exists` : serverError

  async function submit() {
    setServerError(null)
    try {
      const created = await createWarehouse.mutateAsync({ code, name, address: address || undefined, site: site.trim() || undefined })
      toast.success("Warehouse added — now add its floors and modules")
      router.push(`/app/warehouses/${created.id}`)
      setOpen(false)
      setCode("")
      setName("")
      setAddress("")
      setSite("")
    } catch (err) {
      // A 409 from the server (e.g. someone else just added the same name) is shown under the field.
      const message = err instanceof Error ? err.message : "That did not work"
      if (/already exists/i.test(message)) setServerError(message)
      else onError(err)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setServerError(null)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Add warehouse</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add warehouse</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="wh-code">Code</FieldLabel>
            <Input
              id="wh-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WH3"
              aria-invalid={codeTaken}
            />
            <FieldError errors={codeTaken ? [{ message: `Code "${code.trim()}" is already used` }] : undefined} />
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-name">Name</FieldLabel>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setServerError(null)
              }}
              placeholder="East Warehouse"
              aria-invalid={!!nameError}
            />
            <FieldError errors={nameError ? [{ message: nameError }] : undefined} />
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-site">Site (optional)</FieldLabel>
            <Input id="wh-site" list="wh-sites" value={site} maxLength={80} onChange={(e) => setSite(e.target.value)} placeholder="e.g. AVANTO" />
            <datalist id="wh-sites">
              {(sites ?? []).map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-address">Address (optional)</FieldLabel>
            <Input id="wh-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!code || !name || nameTaken || codeTaken || createWarehouse.isPending}>
            {createWarehouse.isPending ? "Adding…" : "Add warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const num = (n: number) => n.toLocaleString("en-GB")

/** Warehouses grouped by site (Docbox "Sede"), sites A–Z, warehouses without a site last. */
function siteGroups(warehouses: Warehouse[]): [string | undefined, Warehouse[]][] {
  const groups = new Map<string | undefined, Warehouse[]>()
  for (const w of warehouses) groups.set(w.site, [...(groups.get(w.site) ?? []), w])
  return [...groups.entries()].sort(([a], [b]) => (a === undefined ? 1 : b === undefined ? -1 : a.localeCompare(b)))
}

/** One number with its label (modules / positions / boxes on a card, totals at the top). */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-base font-semibold tabular-nums">{num(value)}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

const LEVEL_CLASS = { good: "bg-status-stored", warning: "bg-status-pending-destruction", critical: "bg-status-hold" } as const

/** How full a warehouse is, and how much room is left (a warehouse with no module has neither). */
function Fullness({ warehouse }: { warehouse: Warehouse }) {
  if (warehouse.totalCapacity === 0) {
    return <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs">No modules yet — add its layout to start storing boxes.</p>
  }
  const percent = capacityPercent(warehouse.usedCapacity, warehouse.totalCapacity)
  const level = capacityLevel(warehouse.usedCapacity, warehouse.totalCapacity)
  return (
    <div className="space-y-1.5">
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full transition-all", LEVEL_CLASS[level])} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{percent}% full</span>
        <span>{formatVolume(Math.max(0, warehouse.totalCapacity - warehouse.usedCapacity))} free</span>
      </p>
    </div>
  )
}

function WarehouseCard({ warehouse, canManageLayout }: { warehouse: Warehouse; canManageLayout: boolean }) {
  return (
    <Card className="hover:ring-primary/50 relative h-full transition-shadow">
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <WarehouseIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="font-mono">{warehouse.code}</span>
              {warehouse.site && <span className="bg-muted text-foreground max-w-40 truncate rounded-full px-2 py-0.5" title={warehouse.site}>{warehouse.site}</span>}
            </p>
            {/* the whole card opens the warehouse; "View boxes" below sits above this link */}
            <Link href={`/app/warehouses/${warehouse.id}`} className="block truncate font-semibold after:absolute after:inset-0">
              {warehouse.name}
            </Link>
            {warehouse.address && <p className="text-muted-foreground mt-0.5 truncate text-sm">{warehouse.address}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat value={warehouse.rackCount} label={warehouse.rackCount === 1 ? "module" : "modules"} />
          <Stat value={warehouse.slotCount} label={warehouse.slotCount === 1 ? "position" : "positions"} />
          <Stat value={warehouse.boxCount} label={warehouse.boxCount === 1 ? "box" : "boxes"} />
        </div>

        <div className="mt-auto space-y-3">
          <Fullness warehouse={warehouse} />
          <div className="relative z-10 flex items-center justify-between text-sm">
            <span className="text-primary font-medium">Open →</span>
            {warehouse.rackCount === 0 && canManageLayout && (
              <Link
                href={`/app/settings/layout-import?warehouse=${warehouse.id}`}
                className="border-input hover:bg-muted rounded-lg border px-3 py-1 text-xs font-medium"
              >
                Add layout
              </Link>
            )}
            {warehouse.boxCount > 0 && (
              <Link href={`/app/boxes?wh=${encodeURIComponent(warehouse.code)}`} className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                View boxes
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function WarehousesListScreen() {
  const canManageLayout = useCan("layout.manage")
  const { data: warehouses, isLoading, isError } = useWarehouses()
  const [search, setSearch] = useState("")
  // Boxes that are registered but not on a shelf yet (they belong to no warehouse, so no card counts them).
  const { data: unplaced } = useBoxSearch({ status: ["unallocated"], pageSize: 1 })

  // Search by name, code, address or site.
  const shown = useMemo(() => {
    const wanted = normalize(search)
    if (!warehouses || !wanted) return warehouses
    return warehouses.filter((w) => normalize([w.code, w.name, w.address, w.site].filter(Boolean).join(" ")).includes(wanted))
  }, [warehouses, search])

  const totals = useMemo(() => {
    const list = warehouses ?? []
    const total = list.reduce((sum, w) => sum + w.totalCapacity, 0)
    const used = list.reduce((sum, w) => sum + w.usedCapacity, 0)
    return {
      warehouses: list.length,
      modules: list.reduce((sum, w) => sum + w.rackCount, 0),
      boxes: list.reduce((sum, w) => sum + w.boxCount, 0),
      percent: capacityPercent(used, total),
    }
  }, [warehouses])

  const groups = shown ? siteGroups(shown) : []

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MapPin}
        title="Warehouses"
        description="Where your boxes are stored, and how much room is left."
        actions={canManageLayout ? <AddWarehouseDialog existing={warehouses ?? []} /> : undefined}
      />

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {isError && <p className="text-destructive text-sm">Couldn&apos;t load warehouses. Try refreshing.</p>}

      {warehouses && warehouses.length === 0 && <p className="text-muted-foreground text-sm">No warehouses yet.{canManageLayout ? " Add one to get started." : ""}</p>}

      {warehouses && warehouses.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Warehouses", num(totals.warehouses)],
              ["Modules", num(totals.modules)],
              ["Boxes on shelves", num(totals.boxes), `${totals.percent}% of the space used`],
              ["Not on a shelf yet", num(unplaced?.total ?? 0), (unplaced?.total ?? 0) > 0 ? "See them →" : undefined],
            ].map(([label, value, note]) => (
              <Card key={label} size="sm">
                <CardContent>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="text-xl font-semibold tabular-nums">{value}</p>
                  {label === "Not on a shelf yet" && note ? (
                    <Link href="/app/boxes?st=unallocated" className="text-primary text-xs underline-offset-4 hover:underline">
                      {note}
                    </Link>
                  ) : (
                    note && <p className="text-muted-foreground text-xs">{note}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, address or site…" className="pl-9" aria-label="Search warehouses" />
            </div>
            {search.trim() && (
              <>
                <p className="text-muted-foreground text-sm">
                  {shown?.length ?? 0} of {warehouses.length} warehouses
                </p>
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  Clear
                </Button>
              </>
            )}
            {canManageLayout && (
              <Link href="/app/settings/sites" className="text-primary text-sm underline-offset-4 hover:underline">
                Manage sites
              </Link>
            )}
          </div>

          {groups.length === 0 && <p className="text-muted-foreground text-sm">No warehouse matches &quot;{search.trim()}&quot;.</p>}

          <div className="grid gap-4 lg:grid-cols-2">
            {groups.flatMap(([, group]) => group).map((warehouse) => (
              <WarehouseCard key={warehouse.id} warehouse={warehouse} canManageLayout={canManageLayout} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
