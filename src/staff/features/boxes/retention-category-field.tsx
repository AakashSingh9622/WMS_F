"use client"

import { useRetentionRules } from "@/api/records"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NONE = "__none__"

/** Retention category picker (codes of the current retention rules) — drives the box's destruction date. */
export function RetentionCategoryField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data: rules } = useRetentionRules()
  const label = (code: string) => {
    if (code === NONE) return "None"
    const rule = rules?.find((r) => r.code === code)
    return rule ? `${rule.code} — ${rule.name} (${rule.retentionYears} years)` : code
  }

  return (
    <Field>
      <FieldLabel htmlFor="retention-category">Retention category (optional)</FieldLabel>
      <Select value={value || NONE} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}>
        <SelectTrigger id="retention-category">
          <SelectValue getLabel={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {rules?.map((r) => (
            <SelectItem key={r.code} value={r.code}>
              {label(r.code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!rules?.length && (
        <FieldDescription>No retention rules yet — a records manager adds them under Records.</FieldDescription>
      )}
    </Field>
  )
}
