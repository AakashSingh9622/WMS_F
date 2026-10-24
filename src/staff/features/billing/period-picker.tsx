"use client"

import { todayISO } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export interface Period {
  from: string
  to: string
}

const year = () => todayISO().slice(0, 4)

export const thisYear = (): Period => ({ from: `${year()}-01-01`, to: todayISO() })

const PRESETS: { label: string; period: () => Period }[] = [
  { label: "This month", period: () => ({ from: `${todayISO().slice(0, 8)}01`, to: todayISO() }) },
  { label: "This year", period: thisYear },
  { label: "Last year", period: () => ({ from: `${Number(year()) - 1}-01-01`, to: `${Number(year()) - 1}-12-31` }) },
]

/** Invoice-date period for the standing accounts: a few presets plus from / to. */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const preset = p.period()
          const active = preset.from === value.from && preset.to === value.to
          return (
            <Button key={p.label} size="sm" variant={active ? "default" : "outline"} onClick={() => onChange(preset)}>
              {p.label}
            </Button>
          )
        })}
      </div>
      <Field className="w-40">
        <FieldLabel htmlFor="period-from">From</FieldLabel>
        <Input
          id="period-from"
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="period-to">To</FieldLabel>
        <Input
          id="period-to"
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </Field>
    </div>
  )
}
