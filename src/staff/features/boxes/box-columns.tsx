import type { ColumnDef } from "@/components/data-table"
import { formatDateRange } from "@/lib/formatting"
import { BoxStatusBadge } from "@/components/status-badge"
import { StoredLocation } from "@/components/location-path"
import type { Box } from "@/api/types"

export const boxColumns: ColumnDef<Box, unknown>[] = [
  { accessorKey: "boxNumber", header: "Box number" },
  { accessorKey: "clientName", header: "Client" },
  { accessorKey: "description", header: "Description" },
  {
    accessorKey: "filingDateFrom",
    header: "Filed",
    cell: ({ row }) => formatDateRange(row.original.filingDateFrom, row.original.filingDateTo),
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <BoxStatusBadge status={row.original.status} /> },
  {
    id: "location",
    header: "Location",
    cell: ({ row }) =>
      row.original.locationPath ? (
        <StoredLocation className="text-sm" path={row.original.locationPath} />
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
]
