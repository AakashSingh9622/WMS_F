"use client"

import { formatDateTime } from "@/lib/formatting"
import { useState } from "react"
import { Download } from "@/components/icons"
import { toast } from "sonner"

import { fetchAllAuditEvents, useAuditSearch } from "@/api/audit"
import { useBoxOrders } from "@/api/boxes"
import { auditEventTypeSchema } from "@/api/types"
import type { AuditEvent, AuditEventType } from "@/api/types"
import { describeAuditEvent } from "@/domain/audit"
import { AuditTimeline } from "@/components/audit-timeline"
import { PaginationFooter } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PAGE_SIZE = 50

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function BoxHistoryTab({ boxId }: { boxId: string }) {
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [orderFilter, setOrderFilter] = useState<string>("all")
  const [exporting, setExporting] = useState(false)

  // Filters are applied by the server (so they cover the whole history, not just the loaded page).
  const filters = {
    boxId,
    type: typeFilter === "all" ? undefined : (typeFilter as AuditEventType),
    orderId: orderFilter === "all" ? undefined : orderFilter,
  }
  const { data, isLoading } = useAuditSearch({ ...filters, page, pageSize: PAGE_SIZE })
  const { data: boxOrders } = useBoxOrders(boxId)

  async function exportCsv() {
    setExporting(true)
    try {
      const events: AuditEvent[] = await fetchAllAuditEvents(filters)
      downloadCsv(
        [
          ["Date", "Type", "Description", "Actor", "Order"],
          ...events.map((e) => [
            formatDateTime(e.at),
            e.type,
            describeAuditEvent(e).text,
            e.actor.name,
            e.orderNumber ?? "",
          ]),
        ],
        `${boxId}-history.csv`,
      )
    } catch {
      toast.error("Could not export the history")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-h-0 max-w-2xl flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v ?? "all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue
              placeholder="All event types"
              getLabel={(v) => (v === "all" ? "All event types" : v.replace(/_/g, " "))}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {auditEventTypeSchema.options.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {boxOrders && boxOrders.length > 0 && (
          <Select
            value={orderFilter}
            onValueChange={(v) => {
              setOrderFilter(v ?? "all")
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue
                placeholder="All orders"
                getLabel={(v) => (v === "all" ? "All orders" : (boxOrders.find((o) => o.id === v)?.orderNumber ?? v))}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All orders</SelectItem>
              {boxOrders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.orderNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCsv} disabled={exporting}>
          <Download className="size-3.5" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Only the timeline scrolls; filters above and the pager below stay in view. */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <AuditTimeline events={data?.items ?? []} orderHref={(id) => `/app/orders/${id}`} />
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
