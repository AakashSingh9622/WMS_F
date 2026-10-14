"use client"

import { useState } from "react"
import {
  getCoreRowModel,
  getSortedRowModel,
  useLegacyTable as useReactTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy"
import { flexRender } from "@tanstack/react-table"
import type { ColumnVisibilityState, RowData, SortingState } from "@tanstack/table-core"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "@/components/icons"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

// @tanstack/react-table v9 renamed the classic hooks-based API into a "legacy"
// compatibility entry point (@tanstack/react-table/legacy) — this re-export keeps
// every caller in this codebase using the familiar `ColumnDef` name.
export type ColumnDef<TData extends RowData, TValue = unknown> = LegacyColumnDef<TData, TValue>

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (row: TData) => void
  storageKey?: string // persists column visibility per user (spec §7)
  /**
   * Server-side pagination: `data` is just the current page, `total` is the full result count. Shows a
   * "Showing 26–50 of 1,532" footer with Previous/Next. (Column sorting is switched off then, because
   * sorting only the visible page would be misleading.)
   */
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }
  /** Left side of the toolbar row (e.g. a result count); the Columns menu is always on the right. */
  toolbar?: React.ReactNode
}

const fmt = (n: number) => n.toLocaleString("en-GB")

export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading,
  emptyMessage = "No results.",
  onRowClick,
  storageKey,
  pagination,
  toolbar,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() => {
    if (!storageKey || typeof localStorage === "undefined") return {}
    try {
      const raw = localStorage.getItem(`dt-columns:${storageKey}`)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  function updateVisibility(next: ColumnVisibilityState) {
    setColumnVisibility(next)
    if (storageKey && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`dt-columns:${storageKey}`, JSON.stringify(next))
      } catch {
        // ignore
      }
    }
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) =>
      updateVisibility(typeof updater === "function" ? updater(columnVisibility) : updater),
    enableSorting: !pagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    // flex-1 + min-h-0: inside a fixed-height page (flex column) the table fills the remaining height and
    // only its body scrolls; the toolbar and the pagination footer stay in view.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="text-muted-foreground text-sm tabular-nums">{toolbar}</div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
            <Columns3 className="size-3.5" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                >
                  {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="bg-card min-h-0 flex-1 overflow-hidden rounded-2xl border shadow-xs [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto">
        <Table>
          <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_var(--border)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className="text-muted-foreground bg-muted/40 h-11 px-4 text-[11px] font-semibold tracking-wide uppercase"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 font-medium"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sortDir === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="text-muted-foreground size-3.5" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-clickable={!!onRowClick}
                  className={onRowClick ? "hover:bg-muted/50 cursor-pointer" : undefined}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {pagination && <PaginationFooter {...pagination} />}
    </div>
  )
}

export function PaginationFooter({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, totalPages)
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)

  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <p className="text-muted-foreground text-sm tabular-nums">
        {total === 0 ? "No results" : `Showing ${fmt(from)}–${fmt(to)} of ${fmt(total)}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm tabular-nums">
          Page {fmt(current)} of {fmt(totalPages)}
        </span>
        <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => onPageChange(current + 1)}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
