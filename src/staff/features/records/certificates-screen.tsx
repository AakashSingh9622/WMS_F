"use client"

import Link from "next/link"
import { useState } from "react"

import { useCertificates } from "@/api/records"
import { formatDateTime } from "@/lib/formatting"
import { PaginationFooter } from "@/components/data-table"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 25

/** Every certificate of destruction issued — kept for good as audit / compliance proof. */
export function CertificatesScreen() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useCertificates({ page, pageSize: PAGE_SIZE })

  if (isLoading) return <Skeleton className="h-40 w-full" />
  return (
    <div className="space-y-4">
      {!data?.items.length ? (
        <p className="text-muted-foreground text-sm">
          No certificates yet — one is issued each time a destruction order is completed.
        </p>
      ) : (
        <div className="bg-card rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Boxes</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/print/destruction-certificate/${c.orderId}`}
                      target="_blank"
                      className="text-primary font-mono hover:underline"
                    >
                      {c.certificateNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{c.clientName}</TableCell>
                  <TableCell>
                    <Link href={`/app/orders/${c.orderId}`} className="hover:underline">
                      {c.content.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{c.content.boxes.length}</TableCell>
                  <TableCell className="capitalize">{c.content.method}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(c.issuedAt)}</TableCell>
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
