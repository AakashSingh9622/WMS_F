"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { SAGE_TAX_RATES } from "@/api/sage"
import { useAddCharge, useCharges, useGenerateCharges, useVoidCharge, type Charge } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { formatDate, formatDateRange, formatMoney, todayISO } from "@/lib/formatting"
import { Download, Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PaginationFooter } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 50
const STATUSES = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "invoiced", label: "Invoiced" },
  { value: "voided", label: "Voided" },
]

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

const monthStart = () => `${todayISO().slice(0, 8)}01`

function AddChargeDialog() {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState("")
  const [taxRateId, setTaxRateId] = useState("GB_STANDARD")
  const [date, setDate] = useState(todayISO())
  const add = useAddCharge()
  const { data: clients } = useGetClientsWithDetailsQuery()
  const clientName = (id: string) => clients?.find((c) => c.ClientId === id)?.Client ?? id
  const valid =
    clientId && description.trim() && Number(quantity) > 0 && unitPrice !== "" && !Number.isNaN(Number(unitPrice))

  async function submit() {
    try {
      await add.mutateAsync({
        clientId,
        clientName: clientName(clientId),
        description: description.trim(),
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        taxRateId,
        date,
      })
      toast.success("Charge added")
      setOpen(false)
      setDescription("")
      setUnitPrice("")
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Add charge</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a one-off charge</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ch-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger id="ch-client">
                <SelectValue placeholder="Choose a client" getLabel={clientName} />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((c) => (
                  <SelectItem key={c.ClientId} value={c.ClientId}>
                    {c.Client}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ch-desc">Description</FieldLabel>
            <Input id="ch-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="ch-qty">Quantity</FieldLabel>
              <Input
                id="ch-qty"
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ch-price">Unit price (£)</FieldLabel>
              <Input
                id="ch-price"
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ch-date">Date</FieldLabel>
              <Input id="ch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ch-tax">VAT</FieldLabel>
            <Select value={taxRateId} onValueChange={(v) => setTaxRateId(v ?? taxRateId)}>
              <SelectTrigger id="ch-tax">
                <SelectValue getLabel={(v) => SAGE_TAX_RATES.find((t) => t.id === v)?.label ?? v} />
              </SelectTrigger>
              <SelectContent>
                {SAGE_TAX_RATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!valid || add.isPending}>
            {add.isPending ? "Saving…" : "Add charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VoidDialog({ charge }: { charge: Charge }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const voidCharge = useVoidCharge()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Void</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this charge?</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {charge.clientName} — {charge.description} ({formatMoney(charge.amount)})
        </p>
        <Field>
          <FieldLabel htmlFor={`void-${charge.id}`}>Reason</FieldLabel>
          <Input id={`void-${charge.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason.trim() || voidCharge.isPending}
            onClick={() =>
              voidCharge.mutate(
                { id: charge.id, reason: reason.trim() },
                { onSuccess: () => (toast.success("Charge voided"), setOpen(false)), onError },
              )
            }
          >
            Void charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Charge events (spec §4.6): what each client owes, built from the warehouse's own records — storage prorated by days
 * from the movement ledger, plus intake / retrieval / delivery / destruction from completed work, plus manual charges.
 * A billing run turns the open ones into invoices.
 */
export function ChargesScreen() {
  const canManage = useCan("billing.manage")
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayISO())
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useCharges({ from, to, status, page, pageSize: PAGE_SIZE })
  const generate = useGenerateCharges()
  const csv = `/api/exports/charges.csv?${new URLSearchParams({ from, to, ...(status ? { status } : {}) })}`

  function runGenerate() {
    generate.mutate(
      { from, to },
      {
        onSuccess: (r) => {
          toast.success(r.created ? `${r.created} new charges, ${formatMoney(r.amount)}` : "Nothing new to charge")
          if (r.clientsWithoutRateCard.length)
            toast.warning(`No rate card (default or own) for: ${r.clientsWithoutRateCard.join(", ")}`)
        },
        onError,
      },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Invoice}
        title="Charges"
        description="What each client owes for the period. Generating is safe to repeat — nothing is charged twice."
        className="shrink-0"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" nativeButton={false} render={<a href={csv} />}>
              <Download /> CSV
            </Button>
            {canManage && <AddChargeDialog />}
            {canManage && (
              <Button onClick={runGenerate} disabled={generate.isPending || !from || !to}>
                {generate.isPending ? "Working…" : "Generate charges"}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel htmlFor="ch-from">From</FieldLabel>
          <Input id="ch-from" type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="ch-to">To</FieldLabel>
          <Input id="ch-to" type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
        </Field>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={status === s.value ? "default" : "outline"}
              onClick={() => (setStatus(s.value), setPage(1))}
            >
              {s.label}
            </Button>
          ))}
        </div>
        {data && (
          <p className="ml-auto text-sm">
            Total (not voided): <span className="font-semibold tabular-nums">{formatMoney(data.amount)}</span>
          </p>
        )}
      </div>

      <div className="bg-card min-h-0 flex-1 overflow-y-auto rounded-2xl border shadow-xs">
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground p-6 text-sm">
            No charges in this period.{canManage ? " Use “Generate charges” to work them out." : ""}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id} className={c.status === "voided" ? "text-muted-foreground line-through" : ""}>
                  <TableCell>{c.clientName}</TableCell>
                  <TableCell className="capitalize">{c.chargeType}</TableCell>
                  <TableCell className="max-w-72 truncate" title={c.description}>
                    {c.description}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {c.periodStart === c.periodEnd
                      ? formatDate(c.periodStart)
                      : formatDateRange(c.periodStart, c.periodEnd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(c.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                  <TableCell>
                    {c.status === "invoiced" && c.invoiceId ? (
                      <Link href={`/app/billing/${c.invoiceId}`} className="text-primary text-sm hover:underline">
                        Invoiced
                      </Link>
                    ) : c.billingRunId && c.status === "open" ? (
                      <Badge variant="outline">In a draft run</Badge>
                    ) : (
                      <span className="text-sm capitalize">{c.status}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage && c.status === "open" && !c.billingRunId && <VoidDialog charge={c} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
