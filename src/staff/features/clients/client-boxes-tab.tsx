"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useClientBoxes } from "@/api/clients"
import { DataTable } from "@/components/data-table"
import { boxColumns } from "@/staff/features/boxes/box-columns"

const PAGE_SIZE = 25

export function ClientBoxesTab({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useClientBoxes(clientId, { page })

  return (
    <DataTable
      columns={boxColumns}
      data={data?.items ?? []}
      isLoading={isLoading}
      emptyMessage="No boxes for this client yet."
      onRowClick={(box) => router.push(`/app/boxes/${box.id}`)}
      storageKey="client-boxes"
      pagination={{ page, pageSize: PAGE_SIZE, total: data?.total ?? 0, onPageChange: setPage }}
    />
  )
}
