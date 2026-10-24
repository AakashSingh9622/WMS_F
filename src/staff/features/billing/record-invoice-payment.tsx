"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useRecordInvoicePayment } from "@/api/invoices"
import { useUpdateFromSage } from "@/api/billing"
import { NOT_CONNECTED, SageError } from "@/api/sage"
import { formatMoney, todayISO } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const METHOD_TEXT = { bank_transfer: "Bank transfer", card: "Card", other: "Other" } as const
type Method = keyof typeof METHOD_TEXT

/** A payment against an invoice in Sage (counts on the client's standing account). Part payments are fine. */
export function RecordInvoicePaymentDialog({
  invoiceId,
  invoiceNumber,
  outstanding,
  size = "sm",
}: {
  invoiceId: string
  invoiceNumber: string
  outstanding: number
  size?: "sm" | "xs"
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(outstanding))
  const [method, setMethod] = useState<Method>("bank_transfer")
  const [reference, setReference] = useState("")
  const [date, setDate] = useState(todayISO())
  const record = useRecordInvoicePayment()
  const n = Number(amount)
  const valid = n > 0 && n <= outstanding + 0.005

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setAmount(String(outstanding))
      }}
    >
      <DialogTrigger render={<Button size={size} variant="outline" />}>Record payment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment for {invoiceNumber}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ip-amount">Amount (£)</FieldLabel>
              <Input
                id="ip-amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <FieldDescription>{formatMoney(outstanding)} still owed.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ip-date">Paid on</FieldLabel>
              <Input id="ip-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ip-method">How</FieldLabel>
            <Select value={method} onValueChange={(v) => setMethod((v as Method) ?? method)}>
              <SelectTrigger id="ip-method">
                <SelectValue getLabel={(v) => METHOD_TEXT[v as Method]} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_TEXT) as Method[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_TEXT[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ip-ref">Reference (optional)</FieldLabel>
            <Input id="ip-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            <FieldDescription>
              Record it in Sage too — or use &quot;Update from Sage&quot; if it&apos;s already there.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!valid || record.isPending}
            onClick={() =>
              record.mutate(
                { id: invoiceId, input: { amount: n, method, reference: reference.trim() || undefined, date } },
                {
                  onSuccess: (inv) => {
                    toast.success(
                      inv.outstanding ? `Recorded — ${formatMoney(inv.outstanding)} still owed` : "Paid in full",
                    )
                    setOpen(false)
                  },
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Could not record the payment"),
                },
              )
            }
          >
            {record.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Update from Sage" — what Sage says is still owed on our invoices (all clients, or one). Needs the Sage sign-in. */
export function UpdateFromSageButton({ clientId }: { clientId?: string }) {
  const sync = useUpdateFromSage()
  return (
    <Button
      variant="outline"
      disabled={sync.isPending}
      onClick={() =>
        sync.mutate(clientId, {
          onSuccess: (r) => {
            toast.success(
              r.updated === 0 && r.notFound === 0
                ? "No invoices in Sage to check"
                : `Updated ${r.updated} invoice${r.updated === 1 ? "" : "s"} from Sage${r.ordersPaid ? ` — ${r.ordersPaid} order${r.ordersPaid === 1 ? "" : "s"} now paid` : ""}`,
            )
            if (r.notFound) toast.warning(`${r.notFound} invoice${r.notFound === 1 ? "" : "s"} not found in Sage`)
          },
          onError: (err) =>
            toast.error(
              err instanceof SageError && err.code === NOT_CONNECTED
                ? "Connect to Sage first (Settings → Sage One)"
                : err instanceof Error
                  ? err.message
                  : "Could not read Sage",
            ),
        })
      }
    >
      {sync.isPending ? "Reading Sage…" : "Update from Sage"}
    </Button>
  )
}
