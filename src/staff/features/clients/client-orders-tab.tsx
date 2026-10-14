"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useClientOrders } from "@/api/clients"
import { DataTable } from "@/components/data-table"
import { orderColumns } from "@/staff/features/orders/order-columns"

const PAGE_SIZE = 25

export function ClientOrdersTab({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useClientOrders(clientId, { page })

  return (
    <DataTable
      columns={orderColumns}
      data={data?.items ?? []}
      isLoading={isLoading}
      emptyMessage="No orders for this client yet."
      onRowClick={(order) => router.push(`/app/orders/${order.id}`)}
      storageKey="client-orders"
      pagination={{ page, pageSize: PAGE_SIZE, total: data?.total ?? 0, onPageChange: setPage }}
    />
  )
}
