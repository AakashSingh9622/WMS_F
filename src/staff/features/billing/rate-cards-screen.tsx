"use client"

import { useState } from "react"
import { toast } from "sonner"

import { SAGE_TAX_RATES } from "@/api/sage"
import { RATE_LABEL, rateKeys, useCreateRateCard, useRateCards, type RateCard, type Rates } from "@/api/billing"
import { useCan } from "@/auth/useAuth"
import { useBoxSizeName, useBoxSizes } from "@/api/settings"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { formatDate, formatMoney, todayISO } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const DEFAULT_CLIENT = "__default__"
type PriceForm = Record<(typeof rateKeys)[number], string>

function toForm(rates?: Rates): PriceForm {
  const form = {} as PriceForm
  for (const k of rateKeys) form[k] = String(rates?.[k] ?? "")
  return form
}

const n = (v: string) => Number(v || 0)

/** Storage is priced per box size (Sprint 11: every size in Settings → Box sizes); `storage` = price typed per code. */
function toRates(form: PriceForm, storage: Record<string, string>, previous?: Rates): Rates {
  const storagePerBoxMonth = { ...previous?.storagePerBoxMonth } // keeps prices of retired sizes not shown
  for (const [code, v] of Object.entries(storage)) storagePerBoxMonth[code] = n(v)
  const rates = { storagePerBoxMonth } as Rates
  for (const k of rateKeys) rates[k] = n(form[k])
  return rates
}

/** New card for a client (or the default card). It starts on its date and closes the card it replaces. */
function RateCardDialog({ from, label }: { from?: RateCard; label: string }) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(from ? (from.clientId ?? DEFAULT_CLIENT) : DEFAULT_CLIENT)
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO())
  const [taxRateId, setTaxRateId] = useState(from?.taxRateId ?? "GB_STANDARD")
  const [notes, setNotes] = useState("")
  const [form, setForm] = useState<PriceForm>(() => toForm(from?.rates))
  const [storageTyped, setStorageTyped] = useState<Record<string, string>>({})
  // sizes in use, plus retired ones this card already prices
  const sizes = useBoxSizes().filter((s) => s.active || from?.rates.storagePerBoxMonth[s.code] !== undefined)
  const storageValue = (code: string) => storageTyped[code] ?? String(from?.rates.storagePerBoxMonth[code] ?? "")
  const storage = Object.fromEntries(sizes.map((s) => [s.code, storageValue(s.code)]))
  const create = useCreateRateCard()
  const { data: clients } = useGetClientsWithDetailsQuery()
  const clientName = (id: string) =>
    id === DEFAULT_CLIENT ? "Default (all clients)" : (clients?.find((c) => c.ClientId === id)?.Client ?? id)
  const pricesOk = [...Object.values(form), ...Object.values(storage)].every(
    (v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0),
  )

  const price = (key: keyof PriceForm, text: string) => (
    <Field key={key}>
      <FieldLabel htmlFor={`rc-${key}`}>{text}</FieldLabel>
      <Input
        id={`rc-${key}`}
        type="number"
        min={0}
        step="0.01"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </Field>
  )

  async function submit() {
    try {
      const isDefault = clientId === DEFAULT_CLIENT
      await create.mutateAsync({
        clientId: isDefault ? undefined : clientId,
        clientName: isDefault ? undefined : clientName(clientId),
        effectiveFrom,
        rates: toRates(form, storage, from?.rates),
        taxRateId,
        notes: notes.trim() || undefined,
      })
      toast.success("Rate card saved")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the rate card")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={from ? "sm" : "default"} variant={from ? "outline" : "default"} />}>
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {from ? `New prices for ${from.clientName ?? "the default card"}` : "New rate card"}
          </DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rc-client">For</FieldLabel>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? clientId)} disabled={!!from}>
                <SelectTrigger id="rc-client">
                  <SelectValue getLabel={clientName} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_CLIENT}>Default (all clients)</SelectItem>
                  {clients?.map((c) => (
                    <SelectItem key={c.ClientId} value={c.ClientId}>
                      {c.Client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="rc-from">Starts on</FieldLabel>
              <Input
                id="rc-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Storage per box / month, by size</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {sizes.map((s) => (
                <Field key={s.code}>
                  <FieldLabel htmlFor={`rc-storage-${s.code}`}>
                    {s.name}
                    {!s.active && " (retired)"}
                  </FieldLabel>
                  <Input
                    id={`rc-storage-${s.code}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={storageValue(s.code)}
                    onChange={(e) => setStorageTyped({ ...storageTyped, [s.code]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">{rateKeys.map((k) => price(k, RATE_LABEL[k]))}</div>
          <FieldDescription>
            Prices in £, before VAT. Storage is charged by the day: a box kept 15 days pays half a month.
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rc-tax">VAT</FieldLabel>
              <Select value={taxRateId} onValueChange={(v) => setTaxRateId(v ?? taxRateId)}>
                <SelectTrigger id="rc-tax">
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
            <Field>
              <FieldLabel htmlFor="rc-notes">Notes (optional)</FieldLabel>
              <Input id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!effectiveFrom || !pricesOk || create.isPending}>
            {create.isPending ? "Saving…" : "Save rate card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CardView({ card, canManage }: { card: RateCard; canManage: boolean }) {
  const live = !card.effectiveTo || card.effectiveTo >= todayISO()
  const sizeName = useBoxSizeName()
  // sizes in use that this card has no storage price for (charged 0 until a new card prices them)
  const unpriced = useBoxSizes().filter((s) => s.active && card.rates.storagePerBoxMonth[s.code] === undefined)
  return (
    <div className={`bg-card space-y-3 rounded-2xl border p-4 ${live ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{card.clientName ?? "Default (all clients)"}</h3>
        <Badge variant="outline">
          {formatDate(card.effectiveFrom)} – {card.effectiveTo ? formatDate(card.effectiveTo) : "open"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          VAT {SAGE_TAX_RATES.find((t) => t.id === card.taxRateId)?.label ?? card.taxRateId}
        </span>
        {canManage && !card.effectiveTo && (
          <div className="ml-auto">
            <RateCardDialog from={card} label="Change prices" />
          </div>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(card.rates.storagePerBoxMonth).map(([code, amount]) => (
          <div key={code} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Storage {sizeName(code)} / month</dt>
            <dd className="tabular-nums">{formatMoney(amount)}</dd>
          </div>
        ))}
        {rateKeys.map((k) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{RATE_LABEL[k]}</dt>
            <dd className="tabular-nums">{formatMoney(card.rates[k])}</dd>
          </div>
        ))}
      </dl>
      {live && unpriced.length > 0 && (
        <p className="text-status-hold text-xs">
          No storage price for {unpriced.map((s) => s.name).join(", ")} — those boxes are stored free until a new card
          prices them{canManage ? " (Change prices)" : ""}.
        </p>
      )}
      {card.notes && <p className="text-muted-foreground text-xs">{card.notes}</p>}
    </div>
  )
}

/** Rate cards (spec §4.6): the prices charges are worked out with. A client's own card beats the default card. */
export function RateCardsScreen() {
  const canManage = useCan("billing.manage")
  const { data, isLoading } = useRateCards()

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Invoice}
        title="Rate cards"
        description="Prices per client, dated. A client without its own card is charged from the default card."
        actions={canManage ? <RateCardDialog label="New rate card" /> : undefined}
      />
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data?.length ? (
        <p className="text-muted-foreground text-sm">No rate cards yet — add the default card first.</p>
      ) : (
        <div className="space-y-3">
          {data.map((card) => (
            <CardView key={card.id} card={card} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  )
}
