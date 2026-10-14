"use client"

import { ScrollText } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { formatDateTime } from "@/lib/formatting"
import { useState } from "react"
import { Download } from "@/components/icons"
import { toast } from "sonner"

import { fetchAllAuditEvents, useAuditSearch } from "@/api/audit"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
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

export function AuditLogScreen() {
  const [clientId, setClientId] = useState("all")
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const { data: clients } = useGetClientsWithDetailsQuery()
  const filters = { clientId: clientId === "all" ? undefined : clientId }
  const { data, isLoading } = useAuditSearch({ ...filters, page, pageSize: PAGE_SIZE })

  async function exportCsv() {
    setExporting(true)
    try {
      const events = await fetchAllAuditEvents(filters)
      downloadCsv(
        [
          ["Date", "Type", "Description", "Actor", "Client", "Order"],
          ...events.map((e) => [
            formatDateTime(e.at),
            e.type,
            describeAuditEvent(e).text,
            e.actor.name,
            e.clientId,
            e.orderNumber ?? "",
          ]),
        ],
        "audit-log.csv",
      )
    } catch {
      toast.error("Could not export the audit log")
    } finally {
      setExporting(false)
    }
  }

  return (
    // Fills the screen: title + filters stay put, only the event list scrolls.
    <div className="flex h-full min-h-0 max-w-2xl flex-col gap-4">
      <PageHeader
        icon={ScrollText}
        title="Audit log"
        description="Every recorded event, across every client."
        className="shrink-0"
      />

      <div className="bg-card flex shrink-0 items-center gap-2 rounded-2xl border p-3 shadow-xs">
        <Select
          value={clientId}
          onValueChange={(v) => {
            setClientId(v ?? "all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue
              placeholder="All clients"
              getLabel={(id) =>
                id === "all" ? "All clients" : (clients?.find((c) => c.ClientId === id)?.Client ?? id)
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients?.map((c) => (
              <SelectItem key={c.ClientId} value={c.ClientId}>
                {c.Client}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCsv} disabled={exporting}>
          <Download className="size-3.5" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
        {(data?.total ?? 0).toLocaleString("en-GB")} events
      </p>

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
