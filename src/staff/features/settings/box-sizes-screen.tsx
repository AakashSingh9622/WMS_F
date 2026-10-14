"use client"

import { PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useBoxSizeSettings, useUpdateBoxSizes } from "@/api/settings"
import { formatLength } from "@/domain/dimensions"
import { formatDateTime } from "@/lib/formatting"
import type { BoxSize } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const ROWS: { size: BoxSize; label: string }[] = [
  { size: "standard", label: "Standard box" },
  { size: "large", label: "Large box" },
]

export function BoxSizesScreen() {
  const { data, isLoading } = useBoxSizeSettings()
  const update = useUpdateBoxSizes()
  // What the admin typed per size; a size that was not touched shows the saved value.
  const [draft, setDraft] = useState<Partial<Record<BoxSize, string>>>({})

  const valueOf = (size: BoxSize) => draft[size] ?? String(data?.sizes[size] ?? "")
  const numberOf = (size: BoxSize) => Number(valueOf(size))
  const isValid = (size: BoxSize) => Number.isInteger(numberOf(size)) && numberOf(size) >= 1 && numberOf(size) <= 1000
  const valid = ROWS.every(({ size }) => isValid(size))
  const changed = ROWS.some(({ size }) => data && numberOf(size) !== data.sizes[size])

  async function save() {
    try {
      await update.mutateAsync({ standard: numberOf("standard"), large: numberOf("large") })
      setDraft({})
      toast.success("Box sizes saved")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the box sizes")
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Box sizes"
        description="How much space (in cm) one box takes in a rack cell. Used for slot capacity and for suggesting where to put boxes."
      />

      {isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <FieldGroup>
            {ROWS.map(({ size, label }) => (
              <Field key={size}>
                <FieldLabel htmlFor={`size-${size}`}>{label} (cm)</FieldLabel>
                <Input
                  id={`size-${size}`}
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  inputMode="numeric"
                  value={valueOf(size)}
                  onChange={(e) => setDraft((d) => ({ ...d, [size]: e.target.value }))}
                />
                <FieldDescription>
                  {isValid(size) ? formatLength(numberOf(size)) : "Whole cm, 1–1000"} · default {data.defaults[size]} cm
                </FieldDescription>
              </Field>
            ))}
          </FieldGroup>

          <p className="text-muted-foreground text-xs">
            A new length applies to boxes registered from now on. Boxes already registered keep the length they were
            stored with, so slot capacity stays correct.
          </p>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!valid || !changed || update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            {data.updatedAt && data.updatedBy && (
              <span className="text-muted-foreground text-xs">
                Last changed by {data.updatedBy.name} on {formatDateTime(data.updatedAt)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
