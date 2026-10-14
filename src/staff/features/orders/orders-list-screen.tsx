"use client"

import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { useOrderSearch } from "@/api/orders"
import { DataTable } from "@/components/data-table"
import { orderColumns } from "@/staff/features/orders/order-columns"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import type { OrderStatus } from "@/api/types"

const PAGE_SIZE = 25

const TABS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: "needs-approval", label: "Needs approval", statuses: ["requested"] },
  { value: "scheduled", label: "Scheduled", statuses: ["approved", "scheduled"] },
  { value: "in-progress", label: "In progress", statuses: ["in_progress"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "all", label: "All" },
]

export function OrdersListScreen() {
  const router = useRouter()
  const { params, setParams } = useUrlFilters()
  const tab = params.tab ?? "all"
  const page = Math.max(1, Number(params.page) || 1)
  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[TABS.length - 1]

  const { data, isLoading } = useOrderSearch(
    useMemo(() => ({ status: activeTab.statuses, page, pageSize: PAGE_SIZE }), [activeTab, page]),
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
