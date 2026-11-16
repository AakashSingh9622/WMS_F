"use client"

import { useState } from "react"

import { useArchiveReport, useLoansReport } from "@/api/reports"
import { Download, ScrollText } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { downloadCsv } from "@/lib/csv"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const ALL = "__all__"
const STATUSES = ["stored", "reserved", "picked", "out", "received", "unallocated", "quarantined", "missing", "pending_destruction", "digitized"]
const label = (s: string) => s.replace(/_/g, " ")

/** Reports (Docbox "Informes"): loan requests by type and urgency, and the archive by client, box size and status. */
export function ReportsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const [clientId, setClientId] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [status, setStatus] = useState(ALL)
  const scope = clientId === ALL ? undefined : clientId

  const loans = useLoansReport({ clientId: scope, from: from || undefined, to: to || undefined })
  const archive = useArchiveReport({ clientId: scope, status: status === ALL ? undefined : status })

  const loanRows = loans.data?.rows ?? []
  const sum = (key: "physicalUrgent" | "physicalNormal" | "digitalUrgent" | "digitalNormal" | "orders" | "boxes") =>
    loanRows.reduce((n, r) => n + r[key], 0)
  const archiveRows = archive.data?.rows ?? []
  const totalBoxes = archiveRows.reduce((n, r) => n + r.boxes, 0)

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Reports"
        description="Requests by type and urgency, and what is in the archive, per client."
      />

      <div className="bg-card grid gap-4 rounded-2xl border p-4 shadow-xs sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="rp-client">Client</FieldLabel>
          <Select value={clientId} onValueChange={(v) => setClientId(v ?? ALL)}>
            <SelectTrigger id="rp-client">
              <SelectValue getLabel={(id) => (id === ALL ? "All clients" : (clients?.find((c) => c.ClientId === id)?.Client ?? id))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {clients?.map((c) => (
                <SelectItem key={c.ClientId} value={c.ClientId}>
                  {c.Client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="rp-from">Requests from</FieldLabel>
          <Input id="rp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rp-to">Requests to</FieldLabel>
          <Input id="rp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rp-status">Archive: box status</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
            <SelectTrigger id="rp-status">
              <SelectValue getLabel={(s) => (s === ALL ? "All (not destroyed)" : label(s))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All (not destroyed)</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Requests by type and urgency</CardTitle>
            <CardDescription>
              Physical = boxes sent out (dispatch). Digital = scanned (digitize). Cancelled and rejected requests are left out.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loanRows.length === 0}
            onClick={() =>
              downloadCsv("requests-report.csv", [
                ["Client", "Client id", "Physical urgent", "Physical normal", "Digital urgent", "Digital normal", "Orders", "Boxes"],
                ...loanRows.map((r) => [r.clientName, r.clientId, r.physicalUrgent, r.physicalNormal, r.digitalUrgent, r.digitalNormal, r.orders, r.boxes].map(String)),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loans.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : loanRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No requests in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Physical urgent</TableHead>
                  <TableHead className="text-right">Physical normal</TableHead>
                  <TableHead className="text-right">Digital urgent</TableHead>
                  <TableHead className="text-right">Digital normal</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loanRows.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    <TableCell className="text-right">{r.physicalUrgent}</TableCell>
                    <TableCell className="text-right">{r.physicalNormal}</TableCell>
                    <TableCell className="text-right">{r.digitalUrgent}</TableCell>
                    <TableCell className="text-right">{r.digitalNormal}</TableCell>
                    <TableCell className="text-right">{r.boxes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{sum("physicalUrgent")}</TableCell>
                  <TableCell className="text-right">{sum("physicalNormal")}</TableCell>
                  <TableCell className="text-right">{sum("digitalUrgent")}</TableCell>
                  <TableCell className="text-right">{sum("digitalNormal")}</TableCell>
                  <TableCell className="text-right">{sum("boxes")}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Archive by client, box size and status</CardTitle>
            <CardDescription>How many boxes each client has, and how many recorded contents (files inside boxes).</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={archiveRows.length === 0}
            onClick={() =>
              downloadCsv("archive-report.csv", [
                ["Client", "Client id", "Box size", "Status", "Boxes", "Recorded contents (client total)"],
                ...archiveRows.map((r) => [r.clientName, r.clientId, r.size, label(r.status), String(r.boxes), String(archive.data?.records[r.clientId] ?? 0)]),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {archive.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : archiveRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No boxes match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Box size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">Recorded contents (client)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archiveRows.map((r) => (
                  <TableRow key={`${r.clientId}:${r.size}:${r.status}`}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="capitalize">{label(r.status)}</TableCell>
                    <TableCell className="text-right">{r.boxes}</TableCell>
                    <TableCell className="text-right">{archive.data?.records[r.clientId] ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{totalBoxes}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
