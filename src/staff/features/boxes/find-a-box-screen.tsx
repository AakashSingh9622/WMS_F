"use client"

import { Search } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useBoxSearch } from "@/api/boxes"
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

export function FindABoxScreen() {
  const router = useRouter()
  const { params, setParams, clear } = useUrlFilters()
  const [q, setQ] = useState(params.q ?? "")
  const debouncedQ = useDebounce(q, 300)
  const includeDestroyed = params.includeDestroyed === "true"
  const onHoldOnly = params.onHold === "true"
  const missingOnly = params.missing === "true"
  const page = Math.max(1, Number(params.page) || 1)

  const { data, isLoading } = useBoxSearch(
    useMemo(
      () => ({
        q: debouncedQ || undefined,
        status: missingOnly ? ["missing" as const] : includeDestroyed ? boxStatusSchema.options : undefined, // server defaults to excluding destroyed
        onHold: onHoldOnly ? true : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
      [debouncedQ, includeDestroyed, onHoldOnly, missingOnly, page],
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
        {(q || onHoldOnly || includeDestroyed || missingOnly) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("")
              clear()
            }}
          >
            Clear filters
          </Button>
        )}
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
