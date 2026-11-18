"use client"

import { PackagePlus, Search } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useCan } from "@/auth/useAuth"
import { useBoxSearch } from "@/api/boxes"
import { useCustomFields } from "@/api/customFields"
import { useExpedientes } from "@/api/expedientes"
import { useWarehouses } from "@/api/warehouses"
import { BOX_STATUS_META } from "@/domain/status"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { boxStatusSchema } from "@/api/types"
import { useDebounce } from "@/hooks/useDebounce"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { DataTable } from "@/components/data-table"
import { boxColumns } from "@/staff/features/boxes/box-columns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

const PAGE_SIZE = 25

/** A small text filter that applies on Enter or when you leave the box (so typing doesn't reload the list on every key). */
function TextFilter({ label, value, onCommit, numeric = false }: { label: string; value: string; onCommit: (value: string) => void; numeric?: boolean }) {
  return (
    <Input
      key={`${label}:${value}`}
      defaultValue={value}
      placeholder={label}
      aria-label={label}
      inputMode={numeric ? "numeric" : undefined}
      className="w-36"
      onBlur={(e) => {
        const next = (numeric ? e.target.value.replace(/\D/g, "") : e.target.value).trim()
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
    />
  )
}

export function FindABoxScreen() {
  const router = useRouter()
  const canRegister = useCan("boxes.operate")
  const { params, setParams, clear } = useUrlFilters()
  const [q, setQ] = useState(params.q ?? "")
  const debouncedQ = useDebounce(q, 300)
  const includeDestroyed = params.includeDestroyed === "true"
  const onHoldOnly = params.onHold === "true"
  const missingOnly = params.missing === "true"
  const page = Math.max(1, Number(params.page) || 1)

  // Search one of a client's own fields (Docbox "Campo / Dato", Like or =): needs the client to know its fields.
  const { data: clients } = useGetClientsWithDetailsQuery()
  const clientId = params.clientId ?? ""
  const { data: expedientes } = useExpedientes(clientId)
  const expedienteId = expedientes?.some((e) => e.id === params.exp) ? params.exp : undefined
  const { data: fields } = useCustomFields(clientId, { expedienteId })
  const cfCode = fields?.some((f) => f.code === params.cf) ? params.cf : undefined
  const [cfText, setCfText] = useState(params.cfv ?? "")
  const debouncedCf = useDebounce(cfText, 300)
  const cfExact = params.cfm === "exact"
  // Where it is, and pallet / container (Docbox "Busqueda"): kept in the URL so a location link can open this list.
  const { data: warehouses } = useWarehouses()
  const statusFilter = boxStatusSchema.options.find((s) => s === params.st)
  const shelfNo = /^\d+$/.test(params.shelf ?? "") ? Number(params.shelf) : undefined
  const placeFilters = [params.site, params.wh, params.zone, params.aisle, params.module, params.shelf, params.pallet, params.container, params.st]

  const { data, isLoading } = useBoxSearch(
    useMemo(
      () => ({
        q: debouncedQ || undefined,
        clientId: clientId || undefined,
        expedienteId,
        cfCode,
        cfValue: cfCode ? debouncedCf || undefined : undefined,
        cfMode: cfExact ? ("exact" as const) : ("contains" as const),
        site: params.site || undefined,
        warehouse: params.wh || undefined,
        zone: params.zone || undefined,
        aisle: params.aisle || undefined,
        module: params.module || undefined,
        row: shelfNo,
        palletNo: params.pallet || undefined,
        containerNo: params.container || undefined,
        status: statusFilter ? [statusFilter] : missingOnly ? ["missing" as const] : includeDestroyed ? boxStatusSchema.options : undefined, // server defaults to excluding destroyed
        onHold: onHoldOnly ? true : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
      [debouncedQ, clientId, expedienteId, cfCode, debouncedCf, cfExact, includeDestroyed, onHoldOnly, missingOnly, page, statusFilter, shelfNo, params.site, params.wh, params.zone, params.aisle, params.module, params.pallet, params.container],
    ),
  )

  function updateQuery(value: string) {
    setQ(value)
    setParams({ q: value, page: undefined })
  }

  return (
    // Fills the screen: filters stay put, only the table body scrolls.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Search}
        title="Find a box"
        description="Search by box number, barcode, description, reference, department, or client."
        className="shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canRegister && (
              <>
                <Button size="sm" nativeButton={false} render={<Link href="/app/boxes/new" />}>
                  <PackagePlus /> Add boxes
                </Button>
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/import" />}>
                  Import from a file
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/bulk-move" />}>
              Move boxes from a file
            </Button>
          </div>
        }
      />

      <div className="bg-card flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border p-3 shadow-xs">
        <Input
          value={q}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search boxes…"
          className="max-w-sm"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Switch
            id="on-hold"
            checked={onHoldOnly}
            onCheckedChange={(v) => setParams({ onHold: v ? "true" : undefined, page: undefined })}
          />
          <Label htmlFor="on-hold" className="text-sm">
            On hold only
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="missing-only"
            checked={missingOnly}
            onCheckedChange={(v) => setParams({ missing: v ? "true" : undefined, page: undefined })}
          />
          <Label htmlFor="missing-only" className="text-sm">
            Missing only
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-destroyed"
            checked={includeDestroyed}
            onCheckedChange={(v) => setParams({ includeDestroyed: v ? "true" : undefined, page: undefined })}
          />
          <Label htmlFor="include-destroyed" className="text-sm">
            Include destroyed
          </Label>
        </div>
        {(q || onHoldOnly || includeDestroyed || missingOnly || clientId || placeFilters.some(Boolean)) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("")
              setCfText("")
              clear()
            }}
          >
            Clear filters
          </Button>
        )}

        <div className="flex w-full flex-wrap items-center gap-3 border-t pt-3">
          <Select value={statusFilter ?? ""} onValueChange={(v) => setParams({ st: v || undefined, page: undefined })}>
            <SelectTrigger className="w-44" aria-label="Status">
              <SelectValue placeholder="Any status" getLabel={(s) => BOX_STATUS_META[s as keyof typeof BOX_STATUS_META]?.label ?? s} />
            </SelectTrigger>
            <SelectContent>
              {boxStatusSchema.options.map((s) => (
                <SelectItem key={s} value={s}>
                  {BOX_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TextFilter label="Site (Sede)" value={params.site ?? ""} onCommit={(v) => setParams({ site: v || undefined, page: undefined })} />
          <Select value={params.wh ?? ""} onValueChange={(v) => setParams({ wh: v || undefined, page: undefined })}>
            <SelectTrigger className="w-44" aria-label="Warehouse">
              <SelectValue placeholder="Any warehouse" getLabel={(code) => warehouses?.find((w) => w.code === code)?.name ?? code} />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.map((w) => (
                <SelectItem key={w.id} value={w.code}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TextFilter label="Block / Floor" value={params.zone ?? ""} onCommit={(v) => setParams({ zone: v || undefined, page: undefined })} />
          <TextFilter label="Aisle" value={params.aisle ?? ""} onCommit={(v) => setParams({ aisle: v || undefined, page: undefined })} />
          <TextFilter label="Module" value={params.module ?? ""} onCommit={(v) => setParams({ module: v || undefined, page: undefined })} />
          <TextFilter label="Row / Shelf" value={params.shelf ?? ""} numeric onCommit={(v) => setParams({ shelf: v || undefined, page: undefined })} />
          <TextFilter label="Pallet" value={params.pallet ?? ""} onCommit={(v) => setParams({ pallet: v || undefined, page: undefined })} />
          <TextFilter label="Container" value={params.container ?? ""} onCommit={(v) => setParams({ container: v || undefined, page: undefined })} />
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 border-t pt-3">
          <Select
            value={clientId}
            onValueChange={(v) => setParams({ clientId: v || undefined, exp: undefined, cf: undefined, cfv: undefined, cfm: undefined, page: undefined })}
          >
            <SelectTrigger className="w-56" aria-label="Client">
              <SelectValue
                placeholder="Any client"
                getLabel={(id) => clients?.find((c) => c.ClientId === id)?.Client ?? id}
              />
            </SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.ClientId} value={c.ClientId}>
                  {c.Client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {expedientes && expedientes.length > 0 && (
            <Select value={expedienteId ?? ""} onValueChange={(v) => setParams({ exp: v || undefined, cf: undefined, cfv: undefined, cfm: undefined, page: undefined })}>
              <SelectTrigger className="w-52" aria-label="Expediente">
                <SelectValue placeholder="Any expediente" getLabel={(id) => expedientes.find((e) => e.id === id)?.code ?? id} />
              </SelectTrigger>
              <SelectContent>
                {expedientes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fields && fields.length > 0 && (
            <>
              <Select value={cfCode ?? ""} onValueChange={(v) => setParams({ cf: v || undefined, page: undefined })}>
                <SelectTrigger className="w-44" aria-label="Client's own field">
                  <SelectValue placeholder="Client's field…" getLabel={(c) => fields.find((f) => f.code === c)?.name ?? c} />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.code} value={f.code}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={cfText}
                disabled={!cfCode}
                onChange={(e) => {
                  setCfText(e.target.value)
                  setParams({ cfv: e.target.value || undefined, page: undefined })
                }}
                placeholder="Value"
                className="max-w-48"
                aria-label="Field value"
              />
              <div className="flex items-center gap-2">
                <Switch
                  id="cf-exact"
                  checked={cfExact}
                  disabled={!cfCode}
                  onCheckedChange={(v) => setParams({ cfm: v ? "exact" : undefined, page: undefined })}
                />
                <Label htmlFor="cf-exact" className="text-sm">
                  Exact match
                </Label>
              </div>
            </>
          )}
        </div>
      </div>

      <DataTable
        columns={boxColumns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No boxes match. Try loosening your filters."
        onRowClick={(box) => router.push(`/app/boxes/${box.id}`)}
        storageKey="find-a-box"
        toolbar={`${(data?.total ?? 0).toLocaleString("en-GB")} boxes`}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onPageChange: (p) => setParams({ page: p === 1 ? undefined : String(p) }),
        }}
      />
    </div>
  )
}
