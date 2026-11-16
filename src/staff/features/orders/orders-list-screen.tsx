"use client"

import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useOrderSearch } from "@/api/orders"
import { DataTable } from "@/components/data-table"
import { Search } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebounce } from "@/hooks/useDebounce"
import { orderColumns } from "@/staff/features/orders/order-columns"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import type { OrderStatus, OrderType } from "@/api/types"

const PAGE_SIZE = 25

const TYPES: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "collection", label: "Collection" },
  { value: "dispatch", label: "Dispatch" },
  { value: "destruction", label: "Destruction" },
  { value: "digitize", label: "Digitize" },
]

const TABS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: "needs-approval", label: "Needs approval", statuses: ["requested"] },
  { value: "billing", label: "Billing", statuses: ["billing"] },
  { value: "scheduled", label: "Scheduled", statuses: ["approved", "scheduled"] },
  { value: "in-progress", label: "In progress", statuses: ["in_progress", "ready"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "all", label: "All" },
]

export function OrdersListScreen() {
  const router = useRouter()
  const { params, setParams } = useUrlFilters()
  const tab = params.tab ?? "all"
  const page = Math.max(1, Number(params.page) || 1)
  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[TABS.length - 1]

  // The search box is typed locally and put in the URL after a short pause (so a reload / shared link keeps it).
  const urlQuery = params.q ?? ""
  const [text, setText] = useState(urlQuery)
  const debounced = useDebounce(text.trim(), 350)
  useEffect(() => {
    if (debounced !== urlQuery) setParams({ q: debounced || undefined, page: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the typed text settling
  }, [debounced])
  const type = (params.type as OrderType | undefined) || undefined

  const { data, isLoading } = useOrderSearch(
    useMemo(
      () => ({ status: activeTab.statuses, q: urlQuery || undefined, type, page, pageSize: PAGE_SIZE }),
      [activeTab, urlQuery, type, page],
    ),
  )

  return (
    // Fills the screen (the shell is fixed-height): header + tabs stay put, only the table body scrolls.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={ClipboardList}
        title="Orders"
        description="Collections, dispatches, destructions and digitising."
        className="shrink-0"
      />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v, page: undefined })} className="min-h-0 flex-1">
        <TabsList className="shrink-0">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <div className="relative w-full max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search order number, client or contact…"
              aria-label="Search orders"
              className="pl-8"
            />
          </div>
          <Select value={type ?? "all"} onValueChange={(v) => setParams({ type: v && v !== "all" ? v : undefined, page: undefined })}>
            <SelectTrigger className="w-40" aria-label="Order type">
              <SelectValue getLabel={(v) => TYPES.find((t) => t.value === v)?.label ?? v} />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(urlQuery || type) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("")
                setParams({ q: undefined, type: undefined, page: undefined })
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <TabsContent value={tab} className="flex min-h-0 flex-1 flex-col pt-4">
          <DataTable
            columns={orderColumns}
            data={data?.items ?? []}
            isLoading={isLoading}
            emptyMessage="No orders here."
            onRowClick={(order) => router.push(`/app/orders/${order.id}`)}
            storageKey="orders-list"
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              onPageChange: (p) => setParams({ page: p === 1 ? undefined : String(p) }),
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
