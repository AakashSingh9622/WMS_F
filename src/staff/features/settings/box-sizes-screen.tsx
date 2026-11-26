"use client"

import { PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useState } from "react"
import { toast } from "sonner"

import { useBoxSizeSettings, useCreateBoxSize, useDeleteBoxSize, useUpdateBoxSize } from "@/api/settings"
import type { BoxSizeType } from "@/api/types"
import { useCan } from "@/auth/useAuth"
import {
  MAX_DIMENSION_CM,
  checkDimensions,
  formatDimensions,
  formatVolume,
  sizeVolumeCm3,
  volumeCm3,
  type LengthUnit,
} from "@/domain/dimensions"
import { formatDateTime } from "@/lib/formatting"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

interface Dims {
  length: string
  height: string
  depth: string
}

const dimsOf = (s: BoxSizeType): Dims => ({
  length: String(s.lengthCm),
  height: String(s.heightCm),
  depth: String(s.depthCm),
})

/** Length, height and depth of one box (one unit for all three), with what they add up to. */
function DimensionFields({
  idPrefix,
  dims,
  unit,
  onDims,
  onUnit,
}: {
  idPrefix: string
  dims: Dims
  unit: LengthUnit
  onDims: (d: Dims) => void
  onUnit: (u: LengthUnit) => void
}) {
  const check = checkDimensions(dims, unit)
  const set = (key: keyof Dims) => (v: string) => onDims({ ...dims, [key]: v })
  return (
    <div className="space-y-2">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-length`}>Length of one box</FieldLabel>
        <LengthInput id={`${idPrefix}-length`} value={dims.length} unit={unit} onValue={set("length")} onUnit={onUnit} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-height`}>Height</FieldLabel>
          <Input
            id={`${idPrefix}-height`}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={dims.height}
            onChange={(e) => set("height")(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-depth`}>Depth (width)</FieldLabel>
          <Input
            id={`${idPrefix}-depth`}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={dims.depth}
            onChange={(e) => set("depth")(e.target.value)}
          />
        </Field>
      </div>
      <FieldDescription>
        {check.ok
          ? `= ${formatDimensions(check.length, check.height, check.depth)} · takes ${formatVolume(volumeCm3(check.length, check.height, check.depth))} of a module cell`
          : `Each side up to ${MAX_DIMENSION_CM} cm — the space one box takes is length × height × depth.`}
      </FieldDescription>
    </div>
  )
}

function LengthInput({
  id,
  value,
  unit,
  onValue,
  onUnit,
}: {
  id: string
  value: string
  unit: LengthUnit
  onValue: (v: string) => void
  onUnit: (u: LengthUnit) => void
}) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
      <Select value={unit} onValueChange={(v) => onUnit((v as LengthUnit) ?? "cm")}>
        <SelectTrigger className="w-24" aria-label="Length unit">
          <SelectValue getLabel={(v) => (v === "ft" ? "feet" : "cm")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cm">cm</SelectItem>
          <SelectItem value="ft">feet</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function AddSizeCard() {
  const [name, setName] = useState("")
  const [dims, setDims] = useState<Dims>({ length: "", height: "", depth: "" })
  const [unit, setUnit] = useState<LengthUnit>("cm")
  const create = useCreateBoxSize()
  const check = checkDimensions(dims, unit)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a size</CardTitle>
        <CardDescription>A name staff pick when registering boxes, and the space one box takes on a shelf.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!check.ok) return
            create.mutate(
              { name, lengthCm: check.length, heightCm: check.height, depthCm: check.depth },
              {
                onSuccess: (s) => {
                  toast.success(`${s.name} added`)
                  setName("")
                  setDims({ length: "", height: "", depth: "" })
                },
                onError,
              },
            )
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-size-name">Name</FieldLabel>
              <Input
                id="new-size-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Archive XL"
              />
            </Field>
            <DimensionFields idPrefix="new-size" dims={dims} unit={unit} onDims={setDims} onUnit={setUnit} />
            <Button type="submit" disabled={!name.trim() || !check.ok || create.isPending}>
              {create.isPending ? "Adding…" : "Add size"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function SizeRow({ size, canManage }: { size: BoxSizeType; canManage: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(size.name)
  const [dims, setDims] = useState<Dims>(dimsOf(size))
  const [unit, setUnit] = useState<LengthUnit>("cm")
  const update = useUpdateBoxSize()
  const remove = useDeleteBoxSize()
  const check = checkDimensions(dims, unit)
  const removable = !size.builtIn && size.boxCount === 0

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input aria-label="Size name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </TableCell>
        <TableCell colSpan={3}>
          <div className="max-w-xs space-y-1">
            <DimensionFields idPrefix={`dim-${size.code}`} dims={dims} unit={unit} onDims={setDims} onUnit={setUnit} />
            {size.boxCount > 0 && (
              <p className="text-muted-foreground text-xs">Boxes already registered keep their size.</p>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          <Button
            size="sm"
            disabled={!name.trim() || !check.ok || update.isPending}
            onClick={() =>
              update.mutate(
                check.ok
                  ? { code: size.code, name, lengthCm: check.length, heightCm: check.height, depthCm: check.depth }
                  : { code: size.code, name },
                {
                  onSuccess: () => {
                    toast.success("Size saved")
                    setEditing(false)
                  },
                  onError,
                },
              )
            }
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={size.active ? "" : "text-muted-foreground"}>
      <TableCell className="font-medium">
        {size.name}
        {size.builtIn && <span className="text-muted-foreground ml-2 text-xs font-normal">built in</span>}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatDimensions(size.lengthCm, size.heightCm, size.depthCm)}
        <span className="text-muted-foreground ml-2 text-xs">{formatVolume(sizeVolumeCm3(size))}</span>
      </TableCell>
      <TableCell className="tabular-nums">{size.boxCount.toLocaleString("en-GB")}</TableCell>
      <TableCell>
        <Badge variant={size.active ? "secondary" : "outline"}>{size.active ? "In use" : "Retired"}</Badge>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {canManage && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName(size.name)
                setDims(dimsOf(size))
                setUnit("cm")
                setEditing(true)
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { code: size.code, active: !size.active },
                  {
                    onSuccess: () =>
                      toast.success(
                        size.active ? `${size.name} retired — not offered for new boxes` : `${size.name} back in use`,
                      ),
                    onError,
                  },
                )
              }
            >
              {size.active ? "Retire" : "Bring back"}
            </Button>
            {removable && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(size.code, { onSuccess: () => toast.success(`${size.name} removed`), onError })
                }
              >
                Remove
              </Button>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * Settings → Box sizes (Sprint 11). Standard and Large are built in; admins add their own sizes (a name and the length,
 * height and depth one box takes). A size in use can be renamed, resized (only boxes registered afterwards take the new size)
 * or retired — removed only when no box has it.
 */
export function BoxSizesScreen() {
  const { data, isLoading } = useBoxSizeSettings()
  const canManage = useCan("settings.manage")

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PackagePlus}
        title="Box sizes"
        description="The sizes staff choose from when registering boxes, and how much shelf space (length × height × depth) each one takes."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sizes</CardTitle>
            <CardDescription>
              A box takes up its length × height × depth of a rack cell, which decides how many boxes fit. A new size
              applies to boxes registered from then on — boxes already on a shelf keep theirs, so capacity stays right. Retired sizes stay on the boxes that have them but aren&apos;t offered for new ones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Size (L × H × D)</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((s) => (
                    <SizeRow key={s.code} size={s} canManage={canManage} />
                  ))}
                </TableBody>
              </Table>
            )}
            {data?.updatedAt && data.updatedBy && (
              <p className="text-muted-foreground mt-3 text-xs">
                Last changed by {data.updatedBy.name} on {formatDateTime(data.updatedAt)}
              </p>
            )}
          </CardContent>
        </Card>

        {canManage && <AddSizeCard />}
      </div>
    </div>
  )
}
