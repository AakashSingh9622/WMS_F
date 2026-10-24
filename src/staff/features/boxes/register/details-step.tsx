"use client"

import { todayISO } from "@/lib/formatting"
import { useState } from "react"

import { useBoxLengths } from "@/api/settings"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { useCreateBoxesBatch } from "@/api/boxes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Box, BoxSize } from "@/api/types"
import { RetentionCategoryField } from "@/staff/features/boxes/retention-category-field"

export interface RegisterDraft {
  clientId: string
  quantity: number
  description: string
  department: string
  reference: string
  filingDateFrom: string
  filingDateTo: string
  destroyAfter: string
  retentionCategory: string
  size: BoxSize
}

// A function (not a constant) so "today" is the day the form is opened, not the day the app was loaded.
// Only the required date (filing from) defaults to today; the optional ones stay empty.
export const emptyDraft = (): RegisterDraft => ({
  clientId: "",
  quantity: 1,
  description: "",
  department: "",
  reference: "",
  filingDateFrom: todayISO(),
  filingDateTo: "",
  destroyAfter: "",
  retentionCategory: "",
  size: "standard",
})

export function DetailsStep({
  draft,
  onDraftChange,
  lockedClientId,
  orderId,
  orderLabel,
  orderHint,
  onCreated,
}: {
  draft: RegisterDraft
  onDraftChange: (draft: RegisterDraft) => void
  lockedClientId?: string
  orderId?: string
  orderLabel?: string
  /** e.g. "5 new boxes expected on this order · 2 already registered" (collection orders only). */
  orderHint?: string
  onCreated: (boxes: Box[]) => void
}) {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const createBatch = useCreateBoxesBatch()
  const lengths = useBoxLengths()
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) {
    onDraftChange({ ...draft, [key]: value })
  }

  async function submit() {
    if (!draft.clientId || !draft.description || !draft.filingDateFrom) {
      setError("Client, description, and filing date from are required")
      return
    }
    setError(null)
    try {
      const clientName = clients?.find((c) => c.ClientId === draft.clientId)?.Client ?? draft.clientId
      const boxes = await createBatch.mutateAsync({
        clientId: draft.clientId,
        clientName,
        quantity: draft.quantity,
        description: draft.description,
        department: draft.department || undefined,
        reference: draft.reference || undefined,
        filingDateFrom: draft.filingDateFrom,
        filingDateTo: draft.filingDateTo || undefined,
        destroyAfter: draft.destroyAfter || undefined,
        retentionCategory: draft.retentionCategory || undefined,
        size: draft.size,
        orderId,
        orderNumber: orderLabel,
      })
      onCreated(boxes)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't register the boxes")
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      {orderLabel && (
        <p className="bg-muted/50 rounded-md border px-3 py-2 text-sm">Receiving new boxes for {orderLabel}</p>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="client">Client</FieldLabel>
          <Select value={draft.clientId} onValueChange={(v) => set("clientId", v ?? "")} disabled={!!lockedClientId}>
            <SelectTrigger id="client">
              <SelectValue
                placeholder="Choose a client"
                getLabel={(id) => clients?.find((c) => c.ClientId === id)?.Client ?? id}
              />
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
          <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
          <Input
            id="quantity"
            type="number"
            min={1}
            max={200}
            value={draft.quantity}
            onChange={(e) => set("quantity", Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
          />
          {orderHint && <p className="text-muted-foreground text-xs">{orderHint}</p>}
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="department">Department</FieldLabel>
          <Input id="department" value={draft.department} onChange={(e) => set("department", e.target.value)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="reference">Reference</FieldLabel>
          <Input id="reference" value={draft.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="filing-from">Filing date from</FieldLabel>
          <Input
            id="filing-from"
            type="date"
            value={draft.filingDateFrom}
            onChange={(e) => set("filingDateFrom", e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="filing-to">Filing date to (optional)</FieldLabel>
          <Input
            id="filing-to"
            type="date"
            value={draft.filingDateTo}
            onChange={(e) => set("filingDateTo", e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="destroy-after">Destroy after (optional)</FieldLabel>
          <Input
            id="destroy-after"
            type="date"
            value={draft.destroyAfter}
            onChange={(e) => set("destroyAfter", e.target.value)}
          />
        </Field>

        <RetentionCategoryField value={draft.retentionCategory} onChange={(v) => set("retentionCategory", v)} />

        <Field>
          <FieldLabel htmlFor="size">Size</FieldLabel>
          <Select value={draft.size} onValueChange={(v) => set("size", (v as BoxSize) ?? "standard")}>
            <SelectTrigger id="size">
              <SelectValue
                getLabel={(v) => (v === "large" ? `Large (${lengths.large} cm)` : `Standard (${lengths.standard} cm)`)}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard ({lengths.standard} cm)</SelectItem>
              <SelectItem value="large">Large ({lengths.large} cm)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <FieldError errors={error ? [{ message: error }] : undefined} />

        <Button type="button" onClick={submit} disabled={createBatch.isPending}>
          {createBatch.isPending ? "Registering…" : `Register ${draft.quantity} box${draft.quantity === 1 ? "" : "es"}`}
        </Button>
      </FieldGroup>
    </div>
  )
}
