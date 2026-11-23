"use client"

import type { CustomField } from "@/api/customFields"
import { DELIVERY_COLUMN_KEYS, deliveryColumnLabel } from "@/domain/delivery-columns"
import { Button } from "@/components/ui/button"

/**
 * Tick the delivery-note columns wanted and put them in order with the arrows (Docbox "Ordenación C1,C2,C3").
 * `fields` are the custom fields that can be offered; the box number is always printed, so it is not here.
 */
export function DeliveryColumnsPicker({
  fields,
  value,
  onChange,
  canEdit = true,
}: {
  fields: CustomField[]
  value: string[]
  onChange: (next: string[]) => void
  canEdit?: boolean
}) {
  const everything = [...DELIVERY_COLUMN_KEYS, ...fields.map((f) => f.code)] as string[]
  // chosen first (in order), then the rest unticked
  const rows = [...value.filter((k) => everything.includes(k)), ...everything.filter((k) => !value.includes(k))]
  const move = (key: string, by: -1 | 1) => {
    const i = value.indexOf(key)
    const j = i + by
    if (i < 0 || j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {rows.map((key) => {
        const on = value.includes(key)
        return (
          <li key={key} className="flex items-center gap-3 px-3 py-1.5">
            <label className="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                disabled={!canEdit}
                onChange={(e) => onChange(e.target.checked ? [...value, key] : value.filter((k) => k !== key))}
              />
              <span className={on ? "" : "text-muted-foreground"}>{deliveryColumnLabel(key, fields)}</span>
            </label>
            {on && canEdit && (
              <span className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label="Move up" disabled={value[0] === key} onClick={() => move(key, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" size="sm" aria-label="Move down" disabled={value[value.length - 1] === key} onClick={() => move(key, 1)}>
                  ↓
                </Button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
