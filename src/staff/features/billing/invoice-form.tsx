"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import {
  fetchSuggestedLines,
  useSageSettings,
  useSaveInvoice,
  type Invoice,
  type InvoiceLine,
  type InvoiceLineKind,
} from "@/api/invoices"
import { SAGE_TAX_RATES } from "@/api/sage"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { addDaysISO, formatMoney, todayISO } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** A line while it's being edited — numbers stay strings so half-typed values ("1.") don't jump around. */
interface DraftLine {
  key: string
  kind: InvoiceLineKind
  description: string
  quantity: string
  unitPrice: string
  taxRateId: string
  sourceType?: "order"
  sourceId?: string
}

let lineSeq = 0
const toDraft = (l: InvoiceLine): DraftLine => ({
  key: `l${++lineSeq}`,
  kind: l.kind,
  description: l.description,
  quantity: String(l.quantity),
  unitPrice: String(l.unitPrice),
  taxRateId: l.taxRateId,
  sourceType: l.sourceType,
  sourceId: l.sourceId,
})

const qtyOk = (v: string) => Number(v) > 0
const priceOk = (v: string) => v.trim() !== "" && Number(v) >= 0
const lineTotal = (l: DraftLine) =>
  qtyOk(l.quantity) && priceOk(l.unitPrice) ? Math.round(Number(l.quantity) * Number(l.unitPrice) * 100) / 100 : 0

/** First and last day of last month, "yyyy-mm-dd" — the usual invoicing period. */
function lastMonth(): { from: string; to: string } {
  const [y, m] = todayISO().split("-").map(Number)
  const from = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`
  return { from, to: addDaysISO(`${y}-${String(m).padStart(2, "0")}-01`, -1) }
}

export function InvoiceForm({ invoice, initialClientId }: { invoice?: Invoice; initialClientId?: string }) {
  const router = useRouter()
  const save = useSaveInvoice()
  const { data: clients } = useGetClientsWithDetailsQuery()
  const { data: settings } = useSageSettings()
  const period = lastMonth()

  const [clientId, setClientId] = useState(invoice?.clientId ?? initialClientId ?? "")
  const [periodFrom, setPeriodFrom] = useState(invoice?.periodFrom ?? period.from)
  const [periodTo, setPeriodTo] = useState(invoice?.periodTo ?? period.to)
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? todayISO())
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "")
  const [notes, setNotes] = useState(invoice?.notes ?? "")
  const [lines, setLines] = useState<DraftLine[]>(() => (invoice?.lines ?? []).map(toDraft))
  const [suggesting, setSuggesting] = useState(false)

  const terms = settings?.paymentTermsDays ?? 30
  const effectiveDue = dueDate || addDaysISO(invoiceDate, terms) // follows the invoice date until changed by hand
  const defaultTax = settings?.defaultTaxRateId ?? "GB_NO_TAX"
  const clientName = clients?.find((c) => c.ClientId === clientId)?.Client ?? invoice?.clientName ?? clientId
  const net = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const linesOk =
    lines.length > 0 && lines.every((l) => l.description.trim() && qtyOk(l.quantity) && priceOk(l.unitPrice))
  const datesOk = !!invoiceDate && effectiveDue >= invoiceDate && (!periodFrom || !periodTo || periodTo >= periodFrom)
  const taxLabel = (id: string) => SAGE_TAX_RATES.find((t) => t.id === id)?.label ?? id

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function suggest() {
    if (!clientId || !periodFrom || !periodTo) return
    if (lines.length > 0 && !window.confirm("Replace the current lines with suggested ones?")) return
    setSuggesting(true)
    try {
      const res = await fetchSuggestedLines(clientId, periodFrom, periodTo)
      setLines(res.lines.map(toDraft))
      if (res.lines.length === 0) toast.info("Nothing to suggest for this client and period — add lines by hand")
      if (res.alreadyInvoicedOrders.length > 0) {
        toast.info(`Left out, already on an invoice: ${res.alreadyInvoicedOrders.join(", ")}`)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not suggest lines")
    } finally {
      setSuggesting(false)
    }
  }

  async function submit() {
    try {
      const saved = await save.mutateAsync({
        id: invoice?.id,
        input: {
          clientId,
          clientName,
          periodFrom: periodFrom || undefined,
          periodTo: periodTo || undefined,
          invoiceDate,
          dueDate: effectiveDue,
          notes: notes.trim() || undefined,
          lines: lines.map((l) => ({
            kind: l.kind,
            description: l.description.trim(),
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            taxRateId: l.taxRateId,
            sourceType: l.sourceType,
            sourceId: l.sourceId,
          })),
        },
      })
      toast.success(invoice ? "Invoice saved" : `Invoice ${saved.invoiceNumber} prepared`)
      router.push(`/app/billing/${saved.id}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the invoice")
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Client and period</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inv-client">Client</FieldLabel>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger id="inv-client">
                  <SelectValue placeholder="Choose a client" getLabel={() => clientName} />
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
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="inv-from">Period from</FieldLabel>
                <Input id="inv-from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="inv-to">Period to</FieldLabel>
                <Input id="inv-to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              </Field>
              <Button
                variant="outline"
                disabled={!clientId || !periodFrom || !periodTo || suggesting}
                onClick={suggest}
              >
                {suggesting ? "Suggesting…" : "Suggest lines"}
              </Button>
            </div>
            <FieldDescription>
              Suggestions: boxes in storage, boxes registered in the period, and orders completed in the period that
              aren&apos;t on an invoice yet. Prices start at the last price used — check them.
            </FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Unit price £</TableHead>
                  <TableHead className="w-44">VAT</TableHead>
                  <TableHead className="w-24 text-right">Net</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <Input
                        aria-label="Description"
                        value={l.description}
                        onChange={(e) => setLine(l.key, { description: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Quantity"
                        type="number"
                        min={0}
                        step="any"
                        aria-invalid={!qtyOk(l.quantity)}
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Unit price"
                        type="number"
                        min={0}
                        step="0.01"
                        aria-invalid={!priceOk(l.unitPrice)}
                        value={l.unitPrice}
                        onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={l.taxRateId}
                        onValueChange={(v) => setLine(l.key, { taxRateId: v ?? l.taxRateId })}
                      >
                        <SelectTrigger aria-label="VAT rate">
                          <SelectValue getLabel={taxLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {SAGE_TAX_RATES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(lineTotal(l))}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove line"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  toDraft({ kind: "other", description: "", quantity: 1, unitPrice: 0, taxRateId: defaultTax }),
                ])
              }
            >
              Add line
            </Button>
            <p className="text-sm">
              Net total <span className="font-semibold tabular-nums">{formatMoney(net)}</span>
              <span className="text-muted-foreground"> · VAT is worked out by Sage</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dates and notes</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-date">Invoice date</FieldLabel>
                <Input id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="inv-due">Due date</FieldLabel>
                <Input id="inv-due" type="date" value={effectiveDue} onChange={(e) => setDueDate(e.target.value)} />
                <FieldDescription>Invoice date + {terms} days unless you change it.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="inv-notes">Notes (shown on the Sage invoice)</FieldLabel>
              <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={!clientId || !linesOk || !datesOk || save.isPending}>
          {save.isPending ? "Saving…" : invoice ? "Save changes" : "Save draft"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
