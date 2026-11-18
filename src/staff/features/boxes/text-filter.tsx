"use client"

import { Input } from "@/components/ui/input"

/** A small text filter that applies on Enter or when you leave the box (so typing doesn't reload the list on every key). */
export function TextFilter({
  label,
  value,
  onCommit,
  numeric = false,
  className = "w-36",
}: {
  label: string
  value: string
  onCommit: (value: string) => void
  numeric?: boolean
  className?: string
}) {
  return (
    <Input
      key={`${label}:${value}`}
      defaultValue={value}
      placeholder={label}
      aria-label={label}
      inputMode={numeric ? "numeric" : undefined}
      className={className}
      onBlur={(e) => {
        const next = (numeric ? e.target.value.replace(/\D/g, "") : e.target.value).trim()
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
    />
  )
}
