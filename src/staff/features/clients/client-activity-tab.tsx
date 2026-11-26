"use client"

import { useState } from "react"

import { useAuditSearch } from "@/api/audit"
import { AuditTimeline } from "@/components/audit-timeline"
import { PaginationFooter } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime, formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { errorText } from "@/staff/features/clients/client-form-fields"
import { useGetClientActivityQuery } from "@/store/docusoftApi"

const PAGE_SIZE = 50

/** The warehouse's own audit log of this client (our backend) — unchanged. */
function WarehouseActivity({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAuditSearch({ clientId, page, pageSize: PAGE_SIZE })
  return (
    <>
      {/* Only the list scrolls; the pagination footer stays in view. */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <AuditTimeline events={data?.items ?? []} orderHref={(id) => `/app/orders/${id}`} />
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </>
  )
}

/** DocuSoft notes can hold HTML — shown as plain text, never as markup. */
const asText = (note: string) =>
  /<[a-z/][^>]*>/i.test(note)
    ? (new DOMParser().parseFromString(note.replace(/<br\s*\/?>/gi, "\n"), "text/html").body.textContent ?? "")
    : note

/**
 * DocuSoft's own activity log of this client (Json_GetActivityByClientId) — what was done to it in DocuSoft, including
 * the UDF changes made here. DocuSoft sends the whole log at once, so search and pages are worked out here.
 */
function DocusoftActivity({ clientId }: { clientId: string }) {
  const activity = useGetClientActivityQuery(clientId)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const q = search.trim().toLowerCase()
  const rows = (activity.data ?? []).filter(
    (r) => !q || r.user.toLowerCase().includes(q) || asText(r.note).toLowerCase().includes(q),
  )
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <Input
        type="search"
        aria-label="Search DocuSoft activity"
        placeholder="Search by user or text…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {activity.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : activity.isError ? (
          <p className="text-destructive text-sm">{errorText(activity.error)}</p>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {q ? "Nothing matches that search." : "DocuSoft has no activity for this client yet."}
          </p>
        ) : (
          <ol className="space-y-3">
            {shown.map((r) => (
              <li key={r.key} className="border-l-2 pl-3">
                <p className="text-sm whitespace-pre-line">{asText(r.note) || "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {[r.user, r.at ? formatDateTime(r.at) : "", r.at ? formatRelativeTime(r.at) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
    </>
  )
}

/** A client's activity: the warehouse's own audit log (as before), or DocuSoft's activity log of the client. */
export function ClientActivityTab({ clientId }: { clientId: string }) {
  const [source, setSource] = useState<"warehouse" | "docusoft">("warehouse")
  return (
    <div className="flex min-h-0 max-w-xl flex-1 flex-col gap-3">
      <div role="tablist" aria-label="Activity" className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1 text-sm">
        {(
          [
            ["warehouse", "Warehouse"],
            ["docusoft", "DocuSoft"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={source === key}
            onClick={() => setSource(key)}
            className={cn(
              "rounded-md px-3 py-1",
              source === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {/* the DocuSoft log is fetched only when it's opened */}
      {source === "warehouse" ? <WarehouseActivity clientId={clientId} /> : <DocusoftActivity clientId={clientId} />}
    </div>
  )
}
