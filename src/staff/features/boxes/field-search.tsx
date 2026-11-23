"use client"

import { useState } from "react"

import type { CustomField } from "@/api/customFields"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TextFilter } from "@/staff/features/boxes/text-filter"

export const MAX_FIELD_ROWS = 4 // Docbox Busqueda: "up to four search fields"

export type FieldCondition = { code: string; value: string; mode: "exact" | "contains" }

type Params = Record<string, string | undefined>

/** The conditions typed so far (URL params cf1..cf4 = field, cv1..cv4 = text, cm1..cm4 = "exact"), with only real fields. */
export function readFieldConditions(params: Params, fields: CustomField[] | undefined): FieldCondition[] {
  const out: FieldCondition[] = []
  for (let i = 1; i <= MAX_FIELD_ROWS; i++) {
    const code = params[`cf${i}`]
    const value = (params[`cv${i}`] ?? "").trim()
    if (!code || !value || !fields?.some((f) => f.code === code)) continue
    out.push({ code, value, mode: params[`cm${i}`] === "exact" ? "exact" : "contains" })
  }
  return out
}

/** URL params that belong to the field search (to clear them together). */
export const FIELD_PARAM_KEYS = [
  ...Array.from({ length: MAX_FIELD_ROWS }, (_, i) => [`cf${i + 1}`, `cv${i + 1}`, `cm${i + 1}`]).flat(),
  "cj",
]

/**
 * "Campo / Dato" rows: pick one of the client's fields, "Contains" (Like) or "Exact" (=), and the text. With two or more
 * rows a switch says whether a box needs to match all of them (Y) or any of them (O).
 */
export function FieldSearch({
  fields,
  params,
  setParams,
}: {
  fields: CustomField[]
  params: Params
  setParams: (next: Record<string, string | undefined>) => void
}) {
  const usedRows = Math.max(0, ...Array.from({ length: MAX_FIELD_ROWS }, (_, i) => (params[`cf${i + 1}`] || params[`cv${i + 1}`] ? i + 1 : 0)))
  const [shown, setShown] = useState(1)
  const rows = Math.min(MAX_FIELD_ROWS, Math.max(1, shown, usedRows))
  const matchAny = params.cj === "or"

  function removeRow(i: number) {
    setParams({ [`cf${i}`]: undefined, [`cv${i}`]: undefined, [`cm${i}`]: undefined, page: undefined })
    if (i === rows && rows > 1) setShown(rows - 1)
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {Array.from({ length: rows }, (_, idx) => {
        const i = idx + 1
        const code = fields.some((f) => f.code === params[`cf${i}`]) ? (params[`cf${i}`] as string) : ""
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select value={code} onValueChange={(v) => setParams({ [`cf${i}`]: v || undefined, page: undefined })}>
              <SelectTrigger className="w-44" aria-label={`Field ${i}`}>
                <SelectValue placeholder="Client's field…" getLabel={(c) => fields.find((f) => f.code === c)?.name ?? c} />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.code} value={f.code}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={params[`cm${i}`] === "exact" ? "exact" : "contains"} onValueChange={(v) => setParams({ [`cm${i}`]: v === "exact" ? "exact" : undefined, page: undefined })}>
              <SelectTrigger className="w-32" aria-label={`Match ${i}`}>
                <SelectValue getLabel={(v) => (v === "exact" ? "Exact (=)" : "Contains (Like)")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contains (Like)</SelectItem>
                <SelectItem value="exact">Exact (=)</SelectItem>
              </SelectContent>
            </Select>
            <TextFilter label="Value" value={params[`cv${i}`] ?? ""} className="w-56" onCommit={(v) => setParams({ [`cv${i}`]: v || undefined, page: undefined })} />
            {rows > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label={`Remove field ${i}`}>
                Remove
              </Button>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        {rows < MAX_FIELD_ROWS && (
          <Button variant="outline" size="sm" onClick={() => setShown(rows + 1)}>
            Add a field
          </Button>
        )}
        {rows > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label="How the fields combine">
            <Button variant={matchAny ? "outline" : "default"} size="sm" onClick={() => setParams({ cj: undefined, page: undefined })}>
              Match all (Y)
            </Button>
            <Button variant={matchAny ? "default" : "outline"} size="sm" onClick={() => setParams({ cj: "or", page: undefined })}>
              Match any (O)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
