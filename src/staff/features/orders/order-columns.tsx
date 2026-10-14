import type { ColumnDef } from "@/components/data-table"
import { formatDate } from "@/lib/formatting"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { OrderStatusBadge } from "@/components/status-badge"
import type { Order } from "@/api/types"

export const orderColumns: ColumnDef<Order, unknown>[] = [
  { accessorKey: "orderNumber", header: "Order number" },
  { id: "type", header: "Type", cell: ({ row }) => <OrderTypeLabel type={row.original.type} /> },
  { accessorKey: "clientName", header: "Client" },
  { accessorKey: "boxCount", header: "Boxes" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <OrderStatusBadge status={row.original.status} /> },
  {
    id: "date",
    header: "Scheduled / completed",
    cell: ({ row }) => formatDate(row.original.completedAt ?? row.original.scheduledFor ?? row.original.createdAt),
  },
  {
    id: "requestedBy",
    header: "Requested by",
    cell: ({ row }) => row.original.requestedBy.name,
  },
]
