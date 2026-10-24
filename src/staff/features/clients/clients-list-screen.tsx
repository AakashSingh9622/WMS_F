"use client"

import { Search, Users } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useMemo } from "react"
import { useRouter } from "next/navigation"

import {
  docusoftApi,
  projectIdOf,
  useGetClientsWithDetailsQuery,
  useGetFolderClientsQuery,
  useGetFoldersQuery,
  type DocusoftClient,
} from "@/store/docusoftApi"
import { useClientStats, type ClientStats } from "@/api/clients"
import { useDebounce } from "@/hooks/useDebounce"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  clientSelected,
  filterChanged,
  folderSelected,
  pageChanged,
  searchChanged,
  sortChanged,
  type ClientsFilter,
  type ClientsSort,
} from "@/store/clientsUiSlice"
import { DataTable, type ColumnDef } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney, formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25
const ALL_FOLDERS = "__all"

/** A DocuSoft client joined with what we hold for it (no stats = nothing stored or ordered yet). */
interface ClientRow {
  client: DocusoftClient
  stats?: ClientStats
}

const SORT_LABEL: Record<ClientsSort, string> = {
  name: "Name A–Z",
  boxes: "Most boxes in storage",
  balance: "Highest balance",
  activity: "Most recent activity",
}

const FILTERS: { id: ClientsFilter; label: string; test: (r: ClientRow) => boolean; billing?: boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "storing", label: "Storing boxes", test: (r) => (r.stats?.inStorage ?? 0) > 0 },
  { id: "empty", label: "No boxes yet", test: (r) => !r.stats?.boxes },
  { id: "orders", label: "Open orders", test: (r) => (r.stats?.openOrders ?? 0) > 0 },
  { id: "owes", label: "Owe money", test: (r) => (r.stats?.balance ?? 0) > 0, billing: true },
]

// Same client, same colour: a hue from the client id (FNV-1a, so ids one digit apart still get far-apart colours).
function hueOf(id: string) {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) // final mix: the last character changes every bit
  return ((h ^ (h >>> 16)) >>> 0) % 360
}

function initialsOf(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?"
}

function ClientCell({ client }: { client: DocusoftClient }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        style={{ "--h": hueOf(client.ClientID) } as React.CSSProperties}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.93_0.05_var(--h))] text-xs font-semibold text-[oklch(0.42_0.12_var(--h))] dark:bg-[oklch(0.35_0.06_var(--h))] dark:text-[oklch(0.9_0.06_var(--h))]"
      >
        {initialsOf(client.Client)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{client.Client}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {client.ClientID}
          {client.Email ? ` · ${client.Email}` : ""}
        </span>
      </span>
    </div>
  )
}

function columnsFor(seesBilling: boolean): ColumnDef<ClientRow, unknown>[] {
  return [
    { id: "client", header: "Client", cell: ({ row }) => <ClientCell client={row.original.client} /> },
    {
      id: "boxes",
      header: "In storage",
      cell: ({ row }) => {
        const s = row.original.stats
        if (!s?.boxes) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <span className="text-sm tabular-nums">
            <span className="font-medium">{s.inStorage.toLocaleString("en-GB")}</span>
            <span className="text-muted-foreground"> box{s.inStorage === 1 ? "" : "es"}</span>
            {s.out > 0 && <span className="text-muted-foreground"> · {s.out} out</span>}
          </span>
        )
      },
    },
    {
      id: "orders",
      header: "Open orders",
      cell: ({ row }) => {
        const n = row.original.stats?.openOrders ?? 0
        return n > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            {n} open
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )
      },
    },
    ...(seesBilling
      ? [
          {
            id: "balance",
            header: "Balance",
            cell: ({ row }) => {
              const s = row.original.stats
              if (!s?.balance) return <span className="text-muted-foreground text-sm">—</span>
              return (
                <span className="text-sm tabular-nums">
                  <span className="font-medium">{formatMoney(s.balance)}</span>
                  {(s.overdue ?? 0) > 0 && (
                    <span className="text-status-hold block text-xs">{formatMoney(s.overdue ?? 0)} overdue</span>
                  )}
                </span>
              )
            },
          } satisfies ColumnDef<ClientRow, unknown>,
        ]
      : []),
    {
      id: "activity",
      header: "Last activity",
      cell: ({ row }) => {
        const at = row.original.stats?.lastActivityAt
        return <span className="text-muted-foreground text-sm">{at ? formatRelativeTime(at) : "—"}</span>
      },
    },
  ]
}

function StatTile({
  label,
  value,
  hint,
  active,
  tone,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  active?: boolean
  tone?: "warn"
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "bg-card rounded-2xl border p-4 text-left transition-colors",
        onClick && "hover:border-[#b93c2e]/40",
        active && "border-[#b93c2e]/60 ring-2 ring-[#b93c2e]/15",
      )}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone === "warn" && "text-status-hold")}>{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </button>
  )
}

/**
 * Clients (live from DocuSoft — never stored here) joined with what we hold for each: boxes in storage / out, open
 * orders and, for people who may see billing, the balance owed. Tiles and chips filter; the list sorts by any of them.
 */
export function ClientsListScreen() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  // Folder / search / filter / sort / page live in Redux so they survive navigating away and back (clientsUiSlice.ts).
  const { folderId, q, page, filter, sort } = useAppSelector((state) => state.clientsUi)
  const allFolders = !folderId
  const projectId = allFolders ? undefined : Number(folderId)

  const { data: folders, isError: foldersError } = useGetFoldersQuery()
  const folderClients = useGetFolderClientsQuery(projectId ?? 0, { skip: allFolders })
  const everyClient = useGetClientsWithDetailsQuery(undefined, { skip: !allFolders })
  const { data: statsData } = useClientStats()
  const seesBilling = statsData?.seesBilling ?? false

  const loading = allFolders ? everyClient.isLoading : folderClients.isLoading
  const failed = allFolders ? everyClient.isError : folderClients.isError

  // DocuSoft spells the id ClientId in the practice-wide list and ClientID in a folder's — one shape here.
  const rows = useMemo<ClientRow[]>(() => {
    const stats = new Map((statsData?.items ?? []).map((s) => [s.clientId, s]))
    const clients: DocusoftClient[] = allFolders
      ? (everyClient.data ?? []).map((c) => ({
          ...c,
          ClientID: c.ClientId,
          Client: c.Client,
          ProjectId: projectIdOf(c),
          Email: typeof c.Email === "string" ? c.Email : undefined,
        }))
      : (folderClients.data ?? [])
    return clients.map((client) => ({ client, stats: stats.get(client.ClientID) }))
  }, [allFolders, everyClient.data, folderClients.data, statsData])

  const debouncedQ = useDebounce(q, 250)
  const searched = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.client.Client.toLowerCase().includes(needle) ||
        r.client.ClientID.toLowerCase().includes(needle) ||
        (r.client.Email ?? "").toLowerCase().includes(needle),
    )
  }, [rows, debouncedQ])

  const filters = FILTERS.filter((f) => !f.billing || seesBilling)
  const activeId: ClientsFilter = filters.some((f) => f.id === filter) ? filter : "all"
  const activeFilter = FILTERS.find((f) => f.id === activeId) ?? FILTERS[0]
  const visible = useMemo(() => {
    const list = searched.filter((FILTERS.find((f) => f.id === activeId) ?? FILTERS[0]).test)
    const byName = (a: ClientRow, b: ClientRow) => a.client.Client.localeCompare(b.client.Client)
    const sorters: Record<ClientsSort, (a: ClientRow, b: ClientRow) => number> = {
      name: byName,
      boxes: (a, b) => (b.stats?.inStorage ?? 0) - (a.stats?.inStorage ?? 0) || byName(a, b),
      balance: (a, b) => (b.stats?.balance ?? 0) - (a.stats?.balance ?? 0) || byName(a, b),
      activity: (a, b) => (b.stats?.lastActivityAt ?? "").localeCompare(a.stats?.lastActivityAt ?? "") || byName(a, b),
    }
    return [...list].sort(sorters[sort === "balance" && !seesBilling ? "name" : sort])
  }, [searched, activeId, sort, seesBilling])

  const totals = useMemo(() => {
    const t = { storing: 0, boxes: 0, withOrders: 0, orders: 0, balance: 0, owing: 0, overdue: 0 }
    for (const r of rows) {
      const s = r.stats
      if (!s) continue
      if (s.inStorage > 0) t.storing++
      t.boxes += s.inStorage
      if (s.openOrders > 0) t.withOrders++
      t.orders += s.openOrders
      if ((s.balance ?? 0) > 0) t.owing++
      t.balance += s.balance ?? 0
      t.overdue += s.overdue ?? 0
    }
    return t
  }, [rows])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const columns = useMemo(() => columnsFor(seesBilling), [seesBilling])
  const folderName = allFolders ? "All folders" : folders?.find((f) => String(f.FolderID) === folderId)?.Folder

  function open(row: ClientRow) {
    const client = row.client
    dispatch(clientSelected(client))
    // Opening a client loads its DocuSoft card (name, contacts) and addresses once; both land in the Redux cache, so
    // the Overview and Users tabs open instantly without calling DocuSoft again.
    const pid = projectId ?? projectIdOf(client)
    if (pid !== undefined) {
      dispatch(
        docusoftApi.endpoints.getClientCard.initiate({ projectId: pid, clientId: client.ClientID }),
      ).unsubscribe()
    }
    dispatch(docusoftApi.endpoints.getClientAddresses.initiate(client.ClientID)).unsubscribe()
    router.push(`/app/clients/${encodeURIComponent(client.ClientID)}/boxes`)
  }

  return (
    // Fills the screen: header, tiles and filters stay put, only the client table scrolls.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Users}
        title="Clients"
        description="Your DocuSoft clients, with what we store and bill for each."
        className="shrink-0"
        actions={
          <Select
            value={folderId || ALL_FOLDERS}
            onValueChange={(v) => dispatch(folderSelected(!v || v === ALL_FOLDERS ? "" : v))}
          >
            <SelectTrigger className="w-64" aria-label="DocuSoft folder">
              <SelectValue
                getLabel={(id) =>
                  id === ALL_FOLDERS ? "All folders" : (folders?.find((f) => String(f.FolderID) === id)?.Folder ?? id)
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
              {folders?.map((folder) => (
                <SelectItem key={folder.FolderID} value={String(folder.FolderID)}>
                  {folder.Folder}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {foldersError && <p className="text-destructive text-sm">Couldn&apos;t load folders from DocuSoft.</p>}

      <div className={cn("grid shrink-0 gap-3 sm:grid-cols-2", seesBilling ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatTile
          label={`Clients · ${folderName ?? ""}`}
          value={loading ? "…" : rows.length.toLocaleString("en-GB")}
          hint={`${(rows.length - totals.storing).toLocaleString("en-GB")} not storing boxes`}
          active={filter === "all"}
          onClick={() => dispatch(filterChanged("all"))}
        />
        <StatTile
          label="Storing boxes"
          value={totals.storing.toLocaleString("en-GB")}
          hint={`${totals.boxes.toLocaleString("en-GB")} boxes in the warehouse`}
          active={filter === "storing"}
          onClick={() => dispatch(filterChanged("storing"))}
        />
        <StatTile
          label="With open orders"
          value={totals.withOrders.toLocaleString("en-GB")}
          hint={`${totals.orders} order${totals.orders === 1 ? "" : "s"} in progress`}
          active={filter === "orders"}
          onClick={() => dispatch(filterChanged("orders"))}
        />
        {seesBilling && (
          <StatTile
            label="Owed to you"
            value={formatMoney(totals.balance)}
            hint={
              totals.overdue > 0
                ? `${formatMoney(totals.overdue)} overdue · ${totals.owing} client${totals.owing === 1 ? "" : "s"}`
                : `${totals.owing} client${totals.owing === 1 ? "" : "s"} with a balance`
            }
            tone={totals.overdue > 0 ? "warn" : undefined}
            active={filter === "owes"}
            onClick={() => dispatch(filterChanged("owes"))}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => dispatch(searchChanged(e.target.value))}
            placeholder="Search name, client ID or email…"
            className="pl-8"
            aria-label="Search clients"
          />
        </div>
        <div className="bg-muted inline-flex flex-wrap gap-1 rounded-xl p-1" role="group" aria-label="Filter clients">
          {filters.map((f) => {
            const count = searched.filter(f.test).length
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={activeFilter.id === f.id}
                onClick={() => dispatch(filterChanged(f.id))}
                className={cn(
                  "rounded-lg px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                  activeFilter.id === f.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="ml-auto">
          <Select value={sort} onValueChange={(v) => dispatch(sortChanged((v as ClientsSort) ?? "name"))}>
            <SelectTrigger className="w-56" aria-label="Sort clients">
              <SelectValue getLabel={(v) => `Sort: ${SORT_LABEL[v as ClientsSort] ?? v}`} />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as ClientsSort[])
                .filter((s) => s !== "balance" || seesBilling)
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {SORT_LABEL[s]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {failed ? (
        <p className="text-destructive text-sm">Couldn&apos;t load clients from DocuSoft.</p>
      ) : loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DataTable
          columns={columns}
          data={pageItems}
          isLoading={loading}
          emptyMessage={
            q
              ? "No clients match your search."
              : activeFilter.id !== "all"
                ? `No clients here are “${activeFilter.label.toLowerCase()}”.`
                : "No clients in this folder."
          }
          onRowClick={open}
          storageKey="docusoft-clients-v2"
          toolbar={
            <p className="text-muted-foreground text-sm tabular-nums">
              {visible.length.toLocaleString("en-GB")} client{visible.length === 1 ? "" : "s"}
              {activeFilter.id !== "all" || q ? ` of ${rows.length.toLocaleString("en-GB")}` : ""}
            </p>
          }
          pagination={{
            page: currentPage,
            pageSize: PAGE_SIZE,
            total: visible.length,
            onPageChange: (p) => dispatch(pageChanged(p)),
          }}
        />
      )}
    </div>
  )
}
