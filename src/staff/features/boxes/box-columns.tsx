import type { ColumnDef } from "@/components/data-table"
import { formatDateRange } from "@/lib/formatting"
import { BoxStatusBadge } from "@/components/status-badge"
import { LocationPath } from "@/components/location-path"
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
        <LocationPath
          className="text-sm"
          segments={[
            { label: row.original.locationPath.warehouse },
            { label: `Rack ${row.original.locationPath.rack}` },
            { label: `Slot ${row.original.locationPath.slot}` },
          ]}
        />
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
  },
]
