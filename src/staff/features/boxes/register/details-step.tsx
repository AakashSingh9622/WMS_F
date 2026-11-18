"use client"

import { formatDate, formatDateRange, todayISO } from "@/lib/formatting"
import { useState } from "react"
import { toast } from "sonner"

import { useBoxLengths, useBoxSizeName, useBoxSizes } from "@/api/settings"
import { useCustomFields } from "@/api/customFields"
import { useExpedientes } from "@/api/expedientes"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { useBoxSearch, useCorrectRegisteredBoxes, useCreateBoxesBatch, type CorrectBoxesInput } from "@/api/boxes"
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
  /** The client's expediente (Docbox); empty when the client has none. */
  expedienteId: string
  quantity: number
  description: string
  department: string
  reference: string
  filingDateFrom: string
  filingDateTo: string
  destroyAfter: string
  retentionCategory: string
  /** Docbox "Nº Palet", "Observaciones" and "Fecha Entrada". */
  palletNo: string
  containerNo: string
  containerType: string
  comments: string
  entryDate: string
  /** Where to put the boxes now (all optional; module + shelf place them). New batch only, never saved on the boxes as text. */
  placeSite: string
  placeWarehouse: string
  placeFloor: string
  placeAisle: string
  placeModule: string
  placeShelf: string
  size: BoxSize
  /** The client's own fields by code ({ C1: "…" }) -- shown for a new batch only. */
  customFields: Record<string, string>
}

// A function (not a constant) so "today" is the day the form is opened, not the day the app was loaded.
// Only the required date (filing from) defaults to today; the optional ones stay empty.
export const emptyDraft = (): RegisterDraft => ({
  clientId: "",
  expedienteId: "",
  quantity: 1,
  description: "",
  department: "",
  reference: "",
  filingDateFrom: todayISO(),
  filingDateTo: "",
  destroyAfter: "",
  retentionCategory: "",
  palletNo: "",
  containerNo: "",
  containerType: "",
  comments: "",
  entryDate: todayISO(),
  placeSite: "",
  placeWarehouse: "",
  placeFloor: "",
  placeAisle: "",
  placeModule: "",
  placeShelf: "",
  size: "standard",
  customFields: {},
})

/** The form, filled in from a registered batch (all boxes of a batch share these details). */
function draftFromBoxes(boxes: Box[]): RegisterDraft {
  const b = boxes[0]
  return {
    clientId: b.clientId,
    expedienteId: b.expedienteId ?? "",
    quantity: boxes.length,
    description: b.description,
    department: b.department ?? "",
    reference: b.reference ?? "",
    filingDateFrom: b.filingDateFrom,
    filingDateTo: b.filingDateTo ?? "",
    destroyAfter: b.destroyAfter ?? "",
    retentionCategory: b.retentionCategory ?? "",
    palletNo: b.palletNo ?? "",
    containerNo: b.containerNo ?? "",
    containerType: b.containerType ?? "",
    comments: b.comments ?? "",
    entryDate: b.entryDate ?? b.createdAt,
    placeSite: "",
    placeWarehouse: "",
    placeFloor: "",
    placeAisle: "",
    placeModule: "",
    placeShelf: "",
    size: b.size,
    customFields: {},
  }
}

/** The client's own fields (Settings → Custom fields) as inputs; nothing is shown when the client has none. */
function CustomFieldsSection({
  clientId,
  expedienteId,
  values,
  onChange,
}: {
  clientId: string
  expedienteId?: string
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  const { data: fields } = useCustomFields(clientId, { expedienteId })
  if (!fields || fields.length === 0) return null
  return (
    <Section title="Client's own fields" description="The extra details this client keeps about its boxes.">
      {fields.map((f) => (
        <Field key={f.code}>
          <FieldLabel htmlFor={`cf-${f.code}`}>
            {f.name}
            {f.required ? "" : " (optional)"}
          </FieldLabel>
          <Input
            id={`cf-${f.code}`}
            type={f.fieldType === "date" ? "date" : f.fieldType === "number" ? "number" : "text"}
            step={f.fieldType === "number" ? "any" : undefined}
            value={values[f.code] ?? ""}
            onChange={(e) => onChange({ ...values, [f.code]: e.target.value })}
          />
        </Field>
      ))}
    </Section>
  )
}

const TEXT_FIELDS = [
  "description",
  "department",
  "reference",
  "filingDateFrom",
  "filingDateTo",
  "destroyAfter",
  "retentionCategory",
  "palletNo",
  "containerNo",
  "containerType",
  "comments",
  "entryDate",
] as const

/** The client's expedientes and the one in use: the chosen one, or the only one. `needed` while it has some and none is chosen. */
function useExpedienteChoice(clientId: string, chosen: string) {
  const { data } = useExpedientes(clientId)
  const list = data ?? []
  const id = list.some((e) => e.id === chosen) ? chosen : list.length === 1 ? list[0].id : ""
  return { list, id, needed: list.length > 0 && !id }
}

/** What is still wrong with the form, in words (null when it can be sent). */
function draftProblem(d: RegisterDraft): string | null {
  const missing = [
    !d.clientId && "client",
    !d.description.trim() && "description",
    !d.filingDateFrom && "filing date from",
    !d.entryDate && "entry date",
  ].filter(Boolean)
  if (missing.length) return `Still needed: ${missing.join(", ")}.`
  const placeAny = [d.placeSite, d.placeWarehouse, d.placeFloor, d.placeAisle, d.placeModule, d.placeShelf].some((v) => v.trim())
  if (placeAny && (!d.placeModule.trim() || !/^\d+$/.test(d.placeShelf.trim()))) {
    return "To put the boxes on a shelf, fill in the module and a shelf number — or clear the location."
  }
  if (d.filingDateTo && d.filingDateTo < d.filingDateFrom) return "Filing date to is before filing date from."
  return null
}

/** The location typed in the form, or nothing when it is empty. */
function placeParts(d: RegisterDraft) {
  const parts = {
    site: d.placeSite.trim(),
    warehouse: d.placeWarehouse.trim(),
    floor: d.placeFloor.trim(),
    aisle: d.placeAisle.trim(),
    module: d.placeModule.trim(),
    shelf: d.placeShelf.trim(),
  }
  return Object.values(parts).some(Boolean) ? parts : undefined
}

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

/** Docbox "New record": the location is in the same form. Optional — leave it empty to file the boxes in step 3. */
function PlaceSection({
  draft,
  set,
  patch,
}: {
  draft: RegisterDraft
  set: <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => void
  patch?: (change: Partial<RegisterDraft>) => void
}) {
  // The client's newest box that is on a shelf: its place can be filled in with one click (Docbox shows it by default).
  const last = useBoxSearch({ clientId: draft.clientId, status: ["stored"], page: 1, pageSize: 1 }, { enabled: !!draft.clientId })
  const lastPath = last.data?.items[0]?.locationPath
  const fields: { key: "placeSite" | "placeWarehouse" | "placeFloor" | "placeAisle" | "placeModule" | "placeShelf"; label: string; hint?: string }[] = [
    { key: "placeSite", label: "Site (optional)" },
    { key: "placeWarehouse", label: "Warehouse (optional)", hint: "code or name" },
    { key: "placeFloor", label: "Block / Floor (optional)" },
    { key: "placeAisle", label: "Aisle (optional)" },
    { key: "placeModule", label: "Shelving unit / Module" },
    { key: "placeShelf", label: "Row / Shelf" },
  ]
  return (
    <Section
      title="Put them on a shelf now (optional)"
      description="Fill in the module and shelf and the boxes go there as soon as they are registered — the first positions with room. Leave it empty to file them in step 3."
    >
      {lastPath && patch && (
        <div className="sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                placeSite: lastPath.site ?? "",
                placeWarehouse: lastPath.warehouse,
                placeFloor: lastPath.zone ?? "",
                placeAisle: lastPath.aisle ?? "",
                placeModule: lastPath.rack,
                placeShelf: lastPath.shelf !== undefined ? String(lastPath.shelf) : "",
              })
            }
          >
            Use the place of this client&apos;s last box
          </Button>
        </div>
      )}
      {fields.map((f) => (
        <Field key={f.key}>
          <FieldLabel htmlFor={`place-${f.key}`}>{f.label}</FieldLabel>
          <Input
            id={`place-${f.key}`}
            value={draft[f.key]}
            inputMode={f.key === "placeShelf" ? "numeric" : undefined}
            placeholder={f.hint}
            onChange={(e) => set(f.key, f.key === "placeShelf" ? e.target.value.replace(/\D/g, "") : e.target.value)}
          />
        </Field>
      ))}
    </Section>
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
  showCustomFields = false,
  showLocation = false,
  patch,
}: {
  draft: RegisterDraft
  set: <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => void
  /** Set several fields at once (the last box's place). */
  patch?: (change: Partial<RegisterDraft>) => void
  /** New batch only: put the boxes on a shelf as they are registered. */
  showLocation?: boolean
  /** New batch only: the correct-batch call can't change a client's own fields. */
  showCustomFields?: boolean
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
  const expediente = useExpedienteChoice(draft.clientId, draft.expedienteId)
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

        {expediente.list.length > 0 && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="expediente">Expediente</FieldLabel>
            <Select value={expediente.id} onValueChange={(v) => set("expedienteId", v ?? "")} disabled={!!clientSizeLock || !showCustomFields}>
              <SelectTrigger id="expediente">
                <SelectValue
                  placeholder="Choose the expediente"
                  getLabel={(id) => {
                    const e = expediente.list.find((x) => x.id === id)
                    return e ? `${e.code} — ${e.description}` : id
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                {expediente.list.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
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
          <FieldLabel htmlFor="description">Description (required)</FieldLabel>
          <Textarea
            id="description"
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="e.g. Tax returns 2019–2021"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="department">Department (optional)</FieldLabel>
          <Input id="department" value={draft.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="reference">Reference (optional)</FieldLabel>
          <Input id="reference" value={draft.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="pallet">Pallet number (optional)</FieldLabel>
          <Input id="pallet" value={draft.palletNo} maxLength={40} onChange={(e) => set("palletNo", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="container-no">Container number (optional)</FieldLabel>
          <Input id="container-no" value={draft.containerNo} maxLength={40} onChange={(e) => set("containerNo", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="container-type">Container type (optional)</FieldLabel>
          <Input id="container-type" value={draft.containerType} maxLength={40} onChange={(e) => set("containerType", e.target.value)} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="comments">Comments (optional)</FieldLabel>
          <Textarea
            id="comments"
            rows={2}
            maxLength={1000}
            value={draft.comments}
            onChange={(e) => set("comments", e.target.value)}
          />
        </Field>
      </Section>

      {showCustomFields && draft.clientId && !expediente.needed && (
        <CustomFieldsSection
          clientId={draft.clientId}
          expedienteId={expediente.id || undefined}
          values={draft.customFields ?? {}}
          onChange={(v) => set("customFields", v)}
        />
      )}

      <Section
        title="Dates and retention"
        description="The filing period on the label, and how long to keep the boxes."
      >
        <Field>
          <FieldLabel htmlFor="filing-from">Filing date from (required)</FieldLabel>
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
            min={draft.filingDateFrom || undefined}
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
        <Field>
          <FieldLabel htmlFor="entry-date">Entry date</FieldLabel>
          <Input id="entry-date" type="date" value={draft.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
        </Field>
        <RetentionCategoryField value={draft.retentionCategory} onChange={(v) => set("retentionCategory", v)} />
      </Section>

      {showLocation && <PlaceSection draft={draft} set={set} patch={patch} />}
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
  const expediente = useExpedienteChoice(draft.clientId, draft.expedienteId)
  const { data: shownFields } = useCustomFields(draft.clientId, { expedienteId: expediente.id || undefined })
  const problem = draftProblem(draft) ?? (expediente.needed ? "Choose the expediente." : null)
  // Only the fields of the chosen expediente: a value typed for another one is dropped.
  const shownCodes = new Set((shownFields ?? []).map((f) => f.code))
  const customToSend = Object.fromEntries(Object.entries(draft.customFields ?? {}).filter(([code]) => shownCodes.has(code)))

  async function submit() {
    if (problem) {
      setError(problem)
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
        expedienteId: expediente.id || undefined,
        customFields: Object.keys(customToSend).length ? customToSend : undefined,
        palletNo: draft.palletNo || undefined,
        containerNo: draft.containerNo.trim() || undefined,
        containerType: draft.containerType.trim() || undefined,
        comments: draft.comments.trim() || undefined,
        entryDate: draft.entryDate || undefined,
        place: placeParts(draft),
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
        showCustomFields
        showLocation
        patch={(change) => onDraftChange({ ...draft, ...change })}
      />
      <SummaryPanel draft={draft} clientName={clientName} error={error}>
        <Button type="button" className="w-full" onClick={submit} disabled={createBatch.isPending || !!problem}>
          {createBatch.isPending
            ? "Registering…"
            : `Register ${draft.quantity} box${draft.quantity === 1 ? "" : "es"} →`}
        </Button>
        <p className="text-muted-foreground text-xs">
          {problem ?? "Box numbers are given when you register. Next you print the labels, then put the boxes on a shelf."}
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
    const problem = draftProblem(draft)
    if (problem) {
      setError(problem)
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
          palletNo: draft.palletNo || undefined,
          containerNo: draft.containerNo.trim() || undefined,
          containerType: draft.containerType.trim() || undefined,
          comments: draft.comments.trim() || undefined,
          entryDate: draft.entryDate || undefined,
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
        <Button type="button" className="w-full" onClick={save} disabled={!dirty || busy || !!draftProblem(draft)}>
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
