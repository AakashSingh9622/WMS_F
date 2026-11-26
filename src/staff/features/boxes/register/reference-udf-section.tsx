"use client"

import { useSyncExternalStore } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useGetClientsWithDetailsQuery,
  useGetReferenceUdfOptionsQuery,
  useGetReferenceUdfsQuery,
  type DocusoftReferenceUdf,
} from "@/store/docusoftApi"
import { getStoredProjectId } from "@/store/docusoftCreds"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const yes = (v: unknown) => s(v).toLowerCase() === "yes"
const noSubscribe = () => () => {}

type Kind = "text" | "numeric" | "date" | "combo"
// DocuSoft: type 2 = Combo (a list); type 1 = Text with a format (String / Integer / Date)
function kindOf(u: DocusoftReferenceUdf): Kind {
  if (s(u.UserDefFieldTypeID) === "2") return "combo"
  const format = s(u.TextControlValue)
  return format === "Integer" ? "numeric" : format === "Date" ? "date" : "text"
}

export interface ReferenceUdfField {
  id: string
  name: string
  tooltip: string
  kind: Kind
  mandatory: boolean
}

/**
 * The selected client's DocuSoft "DMS Reference UDFs" (Json_GetReferenceUDFDetails) — in the default folder (the
 * ProjectId stored at login), else the folder the client was listed under. Hidden fields are left out.
 */
export function useReferenceUdfFields(clientId: string) {
  const stored = useSyncExternalStore(noSubscribe, getStoredProjectId, () => null)
  const { data: clients } = useGetClientsWithDetailsQuery(undefined, { skip: !clientId || !!Number(stored) })
  const projectId = Number(stored) || Number(clients?.find((c) => c.ClientId === clientId)?.ProjectId) || undefined
  const q = useGetReferenceUdfsQuery(
    { clientId, projectId: projectId ?? 0 },
    { skip: !clientId || !projectId },
  )
  const fields: ReferenceUdfField[] = (q.data ?? [])
    .filter((u) => !yes(u.UDFHide) && s(u.Name))
    .map((u) => ({
      id: s(u.UserDefFieldID),
      name: s(u.Name),
      tooltip: s(u.TooltipText),
      kind: kindOf(u),
      mandatory: yes(u.Mandatory),
    }))
  return { fields, isLoading: q.isLoading, isError: q.isError }
}

/** Mandatory fields still empty, and numbers that aren't numbers — in words, for the "Still needed" line. */
export function referenceUdfProblem(fields: ReferenceUdfField[], values: Record<string, string>): string | null {
  const missing = fields.filter((f) => f.mandatory && !s(values[f.name])).map((f) => f.name)
  if (missing.length) return `Still needed: ${missing.join(", ")}.`
  const notNumber = fields.find((f) => f.kind === "numeric" && s(values[f.name]) && Number.isNaN(Number(values[f.name])))
  if (notNumber) return `${notNumber.name} must be a number.`
  return null
}

/** Only the values of the fields shown now (a value typed for another client's field is dropped). */
export function referenceUdfsToSend(fields: ReferenceUdfField[], values: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const f of fields) if (s(values[f.name])) out[f.name] = s(values[f.name])
  return Object.keys(out).length ? out : undefined
}

function ComboInput({
  id,
  clientId,
  field,
  value,
  onChange,
}: {
  id: string
  clientId: string
  field: ReferenceUdfField
  value: string
  onChange: (v: string) => void
}) {
  const { data: options, isLoading } = useGetReferenceUdfOptionsQuery({ clientId, fieldId: field.id })
  const list = options ?? []
  const shown = value && !list.some((o) => o.Value === value) ? [value, ...list.map((o) => o.Value)] : list.map((o) => o.Value)
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={isLoading ? "Loading…" : list.length ? "Choose…" : "No options yet"} />
      </SelectTrigger>
      <SelectContent>
        {shown.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** One reference field as an input (label, the right control for its type, its tooltip). */
export function ReferenceUdfInput({
  clientId,
  field: f,
  value,
  onChange,
  idPrefix = "ref-udf",
}: {
  clientId: string
  field: ReferenceUdfField
  value: string
  onChange: (v: string) => void
  idPrefix?: string
}) {
  const id = `${idPrefix}-${f.id}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {f.name}
        {f.mandatory ? " (required)" : " (optional)"}
        {f.mandatory && !value.trim() && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {f.kind === "combo" ? (
        <ComboInput id={id} clientId={clientId} field={f} value={value} onChange={onChange} />
      ) : (
        <Input
          id={id}
          type={f.kind === "date" ? "date" : f.kind === "numeric" ? "number" : "text"}
          step={f.kind === "numeric" ? "any" : undefined}
          maxLength={500}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {f.tooltip && <FieldDescription>{f.tooltip}</FieldDescription>}
    </Field>
  )
}

/** Register boxes → "Reference UDF": the client's DocuSoft reference fields as inputs; nothing when it has none. */
export function ReferenceUdfSection({
  clientId,
  fields,
  isLoading,
  isError,
  values,
  onChange,
}: {
  clientId: string
  fields: ReferenceUdfField[]
  isLoading: boolean
  isError: boolean
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  if (!clientId) return null
  if (!isLoading && !isError && fields.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reference UDF</CardTitle>
        <CardDescription>The client&apos;s reference fields from DocuSoft, saved on every box of this batch.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : isError ? (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            Couldn&apos;t load this client&apos;s reference fields from DocuSoft.
          </p>
        ) : (
          fields.map((f) => (
            <ReferenceUdfInput
              key={f.id}
              clientId={clientId}
              field={f}
              value={values[f.name] ?? ""}
              onChange={(v) => onChange({ ...values, [f.name]: v })}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}
