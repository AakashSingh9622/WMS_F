"use client"

import { useState } from "react"

import { useAuditSearch } from "@/api/audit"
import { AuditTimeline } from "@/components/audit-timeline"
import { PaginationFooter } from "@/components/data-table"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 50

export function ClientActivityTab({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAuditSearch({ clientId, page, pageSize: PAGE_SIZE })

  return (
    <div className="flex min-h-0 max-w-xl flex-1 flex-col gap-3">
      {/* Only the list scrolls; the pagination footer stays in view. */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <AuditTimeline events={data?.items ?? []} orderHref={(id) => `/app/orders/${id}`} />
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
