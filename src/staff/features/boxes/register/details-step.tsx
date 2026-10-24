"use client"

import { formatDate, formatDateRange, todayISO } from "@/lib/formatting"
import { useState } from "react"
import { toast } from "sonner"

import { useBoxLengths, useBoxSizeName, useBoxSizes } from "@/api/settings"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { useCorrectRegisteredBoxes, useCreateBoxesBatch, type CorrectBoxesInput } from "@/api/boxes"
import { BarcodeLabel } from "@/components/barcode-label"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatLength } from "@/domain/dimensions"
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

/** The form, filled in from a registered batch (all boxes of a batch share these details). */
function draftFromBoxes(boxes: Box[]): RegisterDraft {
  const b = boxes[0]
  return {
    clientId: b.clientId,
    quantity: boxes.length,
    description: b.description,
    department: b.department ?? "",
    reference: b.reference ?? "",
    filingDateFrom: b.filingDateFrom,
    filingDateTo: b.filingDateTo ?? "",
    destroyAfter: b.destroyAfter ?? "",
    retentionCategory: b.retentionCategory ?? "",
    size: b.size,
  }
}

const TEXT_FIELDS = [
  "description",
  "department",
  "reference",
  "filingDateFrom",
  "filingDateTo",
  "destroyAfter",
  "retentionCategory",
] as const

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={value ? "min-w-0 truncate text-right font-medium" : "text-muted-foreground"}>{value || "—"}</dd>
    </div>
  )
}

/** The three cards of fields — the same for a new batch and for fixing a registered one. */
function DetailsForm({
  draft,
  set,
  lockedClientId,
  clientSizeLock,
  minQuantity = 1,
  orderLabel,
  orderHint,
}: {
  draft: RegisterDraft
  set: <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => void
  lockedClientId?: string
  /** Why client and size can't change any more (some boxes are already on a shelf). */
  clientSizeLock?: string
  minQuantity?: number
  orderLabel?: string
  orderHint?: string
}) {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const lengths = useBoxLengths()
  const sizes = useBoxSizes()
  const sizeName = useBoxSizeName()
  return (
    <div className="space-y-4">
      {orderLabel && (
        <p className="bg-muted/50 rounded-md border px-3 py-2 text-sm">Receiving new boxes for {orderLabel}</p>
      )}

      <Section title="Client and boxes" description="Who the boxes belong to, how many and how big.">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="client">Client</FieldLabel>
          <Select
            value={draft.clientId}
            onValueChange={(v) => set("clientId", v ?? "")}
            disabled={!!lockedClientId || !!clientSizeLock}
          >
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
          {clientSizeLock && <p className="text-muted-foreground text-xs">{clientSizeLock}</p>}
        </Field>

        <Field>
          <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
          <Input
            id="quantity"
            type="number"
            min={minQuantity}
            max={200}
            value={draft.quantity}
            onChange={(e) =>
              set("quantity", Math.min(200, Math.max(minQuantity, Number(e.target.value) || minQuantity)))
            }
          />
          {orderHint && <p className="text-muted-foreground text-xs">{orderHint}</p>}
          {minQuantity > 1 && (
            <p className="text-muted-foreground text-xs">
              {minQuantity} already have box numbers — raise it to add more; boxes can&apos;t be removed.
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="size">Size</FieldLabel>
          <Select
            value={draft.size}
            onValueChange={(v) => set("size", (v as BoxSize) ?? "standard")}
            disabled={!!clientSizeLock}
          >
            <SelectTrigger id="size">
              <SelectValue getLabel={(v) => `${sizeName(v)} (${lengths[v] ?? "?"} cm)`} />
            </SelectTrigger>
            <SelectContent>
              {/* sizes in use (Settings → Box sizes); a retired one only if this batch already has it */}
              {sizes
                .filter((s) => s.active || s.code === draft.size)
                .map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name} ({s.lengthCm} cm)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="What's inside" description="Shown on the box page and in search; the client sees it too.">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="e.g. Tax returns 2019–2021"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="department">Department</FieldLabel>
          <Input id="department" value={draft.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="reference">Reference</FieldLabel>
          <Input id="reference" value={draft.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
      </Section>

      <Section
        title="Dates and retention"
        description="The filing period on the label, and how long to keep the boxes."
      >
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
      </Section>
    </div>
  )
}

/** The panel on the right: what will be (or was) registered, a label preview and the step's main button. */
function SummaryPanel({
  draft,
  clientName,
  extra,
  error,
  children,
}: {
  draft: RegisterDraft
  clientName?: string
  extra?: React.ReactNode
  error: string | null
  children: React.ReactNode
}) {
  const lengths = useBoxLengths()
  const sizeName = useBoxSizeName()
  const perBox = lengths[draft.size] ?? lengths.standard
  return (
    <aside className="space-y-4 lg:sticky lg:top-0">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="divide-y border-y">
            <SummaryRow label="Client" value={clientName} />
            <SummaryRow label="Boxes" value={`${draft.quantity} × ${sizeName(draft.size)}`} />
            <SummaryRow label="Shelf space" value={formatLength(perBox * draft.quantity)} />
            <SummaryRow
              label="Filed"
              value={draft.filingDateFrom ? formatDateRange(draft.filingDateFrom, draft.filingDateTo || undefined) : ""}
            />
            <SummaryRow label="Destroy after" value={draft.destroyAfter ? formatDate(draft.destroyAfter) : ""} />
            {extra}
          </dl>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">Label preview</p>
            <div className="origin-top-left scale-[0.82] overflow-hidden rounded-md">
              <BarcodeLabel
                boxNumber="BX — — —"
                barcode="PREVIEW"
                clientCode={draft.clientId}
                clientName={clientName ?? "Client"}
                filingDateFrom={draft.filingDateFrom || todayISO()}
                filingDateTo={draft.filingDateTo || undefined}
              />
            </div>
          </div>
          <FieldError errors={error ? [{ message: error }] : undefined} />
          {children}
        </CardContent>
      </Card>
    </aside>
  )
}

/**
 * Step 1. Before registering: the form (left) and a live summary with a label preview (right, stays in view). Coming
 * back after registering: the same form filled in from the batch — "Save changes" fixes every box at once (and a
 * higher quantity registers the extra boxes); nothing is registered twice.
 */
export function DetailsStep({
  draft,
  onDraftChange,
  lockedClientId,
  orderId,
  orderLabel,
  orderHint,
  registered,
  filedIds,
  onCreated,
  onSaved,
  onStartOver,
}: {
  draft: RegisterDraft
  onDraftChange: (draft: RegisterDraft) => void
  lockedClientId?: string
  orderId?: string
  orderLabel?: string
  /** e.g. "5 new boxes expected on this order · 2 already registered" (collection orders only). */
  orderHint?: string
  /** The boxes this session already registered (then the form fixes them instead of registering new ones). */
  registered: Box[]
  /** Boxes of the batch already on a shelf (their client / size can't change). */
  filedIds: Set<string>
  onCreated: (boxes: Box[]) => void
  /** After fixing the batch: the boxes as they are now (extra ones appended); `relabel` = labels need printing again. */
  onSaved: (boxes: Box[], relabel: boolean) => void
  onStartOver: () => void
}) {
  if (registered.length > 0) {
    return (
      <EditRegistered
        key={registered.map((b) => b.id).join()}
        boxes={registered}
        filedIds={filedIds}
        lockedClientId={lockedClientId}
        orderId={orderId}
        orderLabel={orderLabel}
        onSaved={onSaved}
        onStartOver={onStartOver}
      />
    )
  }
  return (
    <NewBatch
      draft={draft}
      onDraftChange={onDraftChange}
      lockedClientId={lockedClientId}
      orderId={orderId}
      orderLabel={orderLabel}
      orderHint={orderHint}
      onCreated={onCreated}
    />
  )
}

function NewBatch({
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
  orderHint?: string
  onCreated: (boxes: Box[]) => void
}) {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const createBatch = useCreateBoxesBatch()
  const [error, setError] = useState<string | null>(null)
  const clientName = clients?.find((c) => c.ClientId === draft.clientId)?.Client

  async function submit() {
    if (!draft.clientId || !draft.description || !draft.filingDateFrom) {
      setError("Client, description, and filing date from are required")
      return
    }
    setError(null)
    try {
      const boxes = await createBatch.mutateAsync({
        clientId: draft.clientId,
        clientName: clientName ?? draft.clientId,
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <DetailsForm
        draft={draft}
        set={(key, value) => onDraftChange({ ...draft, [key]: value })}
        lockedClientId={lockedClientId}
        orderLabel={orderLabel}
        orderHint={orderHint}
      />
      <SummaryPanel draft={draft} clientName={clientName} error={error}>
        <Button type="button" className="w-full" onClick={submit} disabled={createBatch.isPending}>
          {createBatch.isPending
            ? "Registering…"
            : `Register ${draft.quantity} box${draft.quantity === 1 ? "" : "es"} →`}
        </Button>
        <p className="text-muted-foreground text-xs">
          Box numbers are given when you register. Next you print the labels, then put the boxes on a shelf.
        </p>
      </SummaryPanel>
    </div>
  )
}

function EditRegistered({
  boxes,
  filedIds,
  lockedClientId,
  orderId,
  orderLabel,
  onSaved,
  onStartOver,
}: {
  boxes: Box[]
  filedIds: Set<string>
  lockedClientId?: string
  orderId?: string
  orderLabel?: string
  onSaved: (boxes: Box[], relabel: boolean) => void
  onStartOver: () => void
}) {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const correct = useCorrectRegisteredBoxes()
  const createBatch = useCreateBoxesBatch()
  const saved = draftFromBoxes(boxes)
  const [draft, setDraft] = useState<RegisterDraft>(saved)
  const [error, setError] = useState<string | null>(null)
  const clientName = clients?.find((c) => c.ClientId === draft.clientId)?.Client ?? boxes[0].clientName
  const filed = boxes.filter((b) => filedIds.has(b.id)).length
  const dirty = (Object.keys(saved) as (keyof RegisterDraft)[]).some((k) => draft[k] !== saved[k])
  const busy = correct.isPending || createBatch.isPending
  const first = boxes[0]
  const last = boxes[boxes.length - 1]

  async function save() {
    if (!draft.clientId || !draft.description.trim() || !draft.filingDateFrom) {
      setError("Client, description, and filing date from are required")
      return
    }
    setError(null)
    const patch: Omit<CorrectBoxesInput, "boxIds"> = {}
    for (const key of TEXT_FIELDS) if (draft[key] !== saved[key]) patch[key] = draft[key]
    if (draft.clientId !== saved.clientId) Object.assign(patch, { clientId: draft.clientId, clientName })
    if (draft.size !== saved.size) patch.size = draft.size
    const extra = draft.quantity - boxes.length
    try {
      let now = boxes
      if (Object.keys(patch).length) now = await correct.mutateAsync({ boxIds: boxes.map((b) => b.id), ...patch })
      if (extra > 0) {
        const added = await createBatch.mutateAsync({
          clientId: draft.clientId,
          clientName,
          quantity: extra,
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
        now = [...now, ...added]
      }
      // The label shows the client, box number and filing dates.
      const relabel =
        extra > 0 ||
        patch.clientId !== undefined ||
        patch.filingDateFrom !== undefined ||
        patch.filingDateTo !== undefined
      toast.success(
        `Saved — ${boxes.length} box${boxes.length === 1 ? "" : "es"} updated${extra > 0 ? `, ${extra} added` : ""}${relabel ? ". Print the labels again." : ""}`,
      )
      onSaved(now, relabel)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the changes")
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <DetailsForm
        draft={draft}
        set={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        lockedClientId={lockedClientId}
        clientSizeLock={
          filed > 0
            ? `${filed} of these boxes ${filed === 1 ? "is" : "are"} already on a shelf, so client and size can't change.`
            : undefined
        }
        minQuantity={boxes.length}
        orderLabel={orderLabel}
      />
      <SummaryPanel
        draft={draft}
        clientName={clientName}
        error={error}
        extra={
          <SummaryRow
            label="Registered"
            value={boxes.length > 1 ? `${first.boxNumber} – ${last.boxNumber}` : first.boxNumber}
          />
        }
      >
        <Button type="button" className="w-full" onClick={save} disabled={!dirty || busy}>
          {busy ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </Button>
        <p className="text-muted-foreground text-xs">
          {dirty
            ? "Saves the change on every box of this batch (recorded in each box's history)."
            : "These boxes are registered. Change anything above and save — it applies to the whole batch."}
        </p>
        {dirty && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(saved)}>
            Undo changes
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onStartOver}>
          Start a new batch instead
        </Button>
      </SummaryPanel>
    </div>
  )
}
