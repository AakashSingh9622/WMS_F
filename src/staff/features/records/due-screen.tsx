"use client"

import Link from "next/link"
import { useState } from "react"

import { useDueForDestruction } from "@/api/records"
import { formatDate, todayISO } from "@/lib/formatting"
import { PaginationFooter } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 50

/**
 * Boxes whose retention period is over (spec §4.4) — a list to REVIEW, nothing is destroyed automatically. Boxes under a
 * legal hold are shown but can't be put on a destruction order. To destroy, create a destruction order for the client.
 */
export function DueForDestructionScreen() {
  const [before, setBefore] = useState(todayISO())
  const [page, setPage] = useState(1)
  const { data, isLoading } = useDueForDestruction({ before, page, pageSize: PAGE_SIZE })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field className="w-48">
          <FieldLabel htmlFor="due-before">Due on or before</FieldLabel>
          <Input
            id="due-before"
            type="date"
            value={before}
            onChange={(e) => {
              setBefore(e.target.value)
              setPage(1)
            }}
          />
        </Field>
        <p className="text-muted-foreground max-w-[60ch] text-sm">
          Boxes with us, not on an order, whose destruction date has come (their own &quot;destroy after&quot;, or their
          category&apos;s retention rule). Review them and create a destruction order per client.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data?.items.length ? (
        <p className="text-muted-foreground text-sm">No boxes are due.</p>
      ) : (
        <div className="bg-card rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Box</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Due since</TableHead>
                <TableHead>Because of</TableHead>
                <TableHead>Held back</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((d) => (
                <TableRow key={d.box.id}>
                  <TableCell>
                    <Link href={`/app/boxes/${d.box.id}`} className="text-primary font-mono text-xs hover:underline">
                      {d.box.boxNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/orders/new?type=destruction&clientId=${d.box.clientId}`}
                      className="hover:underline"
                    >
                      {d.box.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{d.box.description}</TableCell>
                  <TableCell>{formatDate(d.destructionDate)}</TableCell>
                  <TableCell className="text-xs">{d.basis}</TableCell>
                  <TableCell>
                    {d.heldBy.length > 0 ? (
                      <Badge variant="outline" className="border-status-hold text-status-hold">
                        Legal hold: {d.heldBy.map((h) => h.authority).join(", ")}
                      </Badge>
                    ) : d.onHold ? (
                      <Badge variant="outline">On hold</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
