"use client"

import { Users } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useMemo } from "react"
import { useRouter } from "next/navigation"

import { docusoftApi, useGetFolderClientsQuery, useGetFoldersQuery, type DocusoftClient } from "@/store/docusoftApi"
import { useDebounce } from "@/hooks/useDebounce"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { clientSelected, folderSelected, pageChanged, searchChanged } from "@/store/clientsUiSlice"
import { DataTable, type ColumnDef } from "@/components/data-table"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PAGE_SIZE = 25

const columns: ColumnDef<DocusoftClient, unknown>[] = [
  { accessorKey: "ClientID", header: "Client ID" },
  { accessorKey: "Client", header: "Name" },
]

export function ClientsListScreen() {
  const router = useRouter()
  const { data: folders, isLoading: loadingFolders, isError: foldersError } = useGetFoldersQuery()
  // Folder / search / page live in Redux so they survive navigating away and back (see clientsUiSlice.ts).
  const dispatch = useAppDispatch()
  const { folderId: selectedFolder, q, page } = useAppSelector((state) => state.clientsUi)
  const projectId = selectedFolder ? Number(selectedFolder) : undefined
  const {
    data: clients,
    isLoading: loadingClients,
    isError: clientsError,
  } = useGetFolderClientsQuery(projectId ?? 0, {
    skip: projectId === undefined,
  })

  const debouncedQ = useDebounce(q, 300)

  // DocuSoft's API doesn't support server-side search/pagination (it always returns every
  // client in the folder at once) — filtering and paging happen here, client-side.
  const filtered = useMemo(() => {
    if (!clients) return []
    const needle = debouncedQ.trim().toLowerCase()
    if (!needle) return clients
    return clients.filter((c) => c.Client.toLowerCase().includes(needle) || c.ClientID.toLowerCase().includes(needle))
  }, [clients, debouncedQ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages) // clamps automatically when a filter shrinks the result set
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    // Fills the screen: folder + search stay put, only the client table scrolls.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Users}
        title="Clients"
        description="Live from DocuSoft — pick a folder to see its clients, then click a client to see its boxes and orders."
        className="shrink-0"
      />

      {loadingFolders && <Skeleton className="h-10 w-64 shrink-0" />}
      {foldersError && <p className="text-destructive text-sm">Couldn&apos;t load folders from DocuSoft.</p>}

      {folders && (
        <Select value={selectedFolder} onValueChange={(value) => dispatch(folderSelected(value ?? ""))}>
          <SelectTrigger className="w-64 shrink-0">
            <SelectValue
              placeholder="Select a folder…"
              getLabel={(id) => folders.find((f) => String(f.FolderID) === id)?.Folder ?? id}
            />
          </SelectTrigger>
          <SelectContent>
            {folders.map((folder) => (
              <SelectItem key={folder.FolderID} value={String(folder.FolderID)}>
                {folder.Folder}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedFolder && clientsError && (
        <p className="text-destructive text-sm">Couldn&apos;t load clients for this folder.</p>
      )}

      {selectedFolder && !clientsError && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-4">
            <Input
              value={q}
              onChange={(e) => dispatch(searchChanged(e.target.value))}
              placeholder="Search by name or client ID…"
              className="max-w-sm"
            />
            <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
              {loadingClients ? "Loading…" : `${filtered.length} client${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <DataTable
            columns={columns}
            data={pageItems}
            isLoading={loadingClients}
            emptyMessage={q ? "No clients match your search." : "No clients in this folder."}
            onRowClick={(client) => {
              dispatch(clientSelected(client))
              // Selecting a client loads its DocuSoft card (name, contacts) and addresses once; both land in the
              // Redux cache, so the Overview and Users tabs open instantly without calling DocuSoft again.
              if (projectId !== undefined) {
                dispatch(
                  docusoftApi.endpoints.getClientCard.initiate({ projectId, clientId: client.ClientID }),
                ).unsubscribe()
              }
              dispatch(docusoftApi.endpoints.getClientAddresses.initiate(client.ClientID)).unsubscribe()
              router.push(`/app/clients/${encodeURIComponent(client.ClientID)}/boxes`)
            }}
            storageKey="docusoft-clients"
            pagination={{
              page: currentPage,
              pageSize: PAGE_SIZE,
              total: filtered.length,
              onPageChange: (p) => dispatch(pageChanged(p)),
            }}
          />
        </>
      )}

      {!selectedFolder && !loadingFolders && (
        <p className="text-muted-foreground text-sm">Choose a folder above to see its clients.</p>
      )}
    </div>
  )
}
