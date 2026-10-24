"use client"

import { PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useState } from "react"
import { toast } from "sonner"

import { useBoxSizeSettings, useCreateBoxSize, useDeleteBoxSize, useUpdateBoxSize } from "@/api/settings"
import type { BoxSizeType } from "@/api/types"
import { useCan } from "@/auth/useAuth"
import { formatLength, toCentimetres, type LengthUnit } from "@/domain/dimensions"
import { formatDateTime } from "@/lib/formatting"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const MAX_CM = 1000

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

/** Length typed in cm or feet -> whole cm, or null when it isn't a usable length. */
function lengthOf(value: string, unit: LengthUnit): number | null {
  const n = Number(value)
  if (!(n > 0)) return null
  const cm = toCentimetres(n, unit)
  return cm >= 1 && cm <= MAX_CM ? cm : null
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
  const [length, setLength] = useState("")
  const [unit, setUnit] = useState<LengthUnit>("cm")
  const create = useCreateBoxSize()
  const cm = lengthOf(length, unit)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a size</CardTitle>
        <CardDescription>A name staff pick when registering boxes, and the shelf space one box takes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!cm) return
            create.mutate(
              { name, lengthCm: cm },
              {
                onSuccess: (s) => {
                  toast.success(`${s.name} added`)
                  setName("")
                  setLength("")
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
            <Field>
              <FieldLabel htmlFor="new-size-length">Shelf length of one box</FieldLabel>
              <LengthInput id="new-size-length" value={length} unit={unit} onValue={setLength} onUnit={setUnit} />
              <FieldDescription>
                {cm
                  ? `= ${formatLength(cm)} of a rack cell`
                  : `The side of the box along the shelf — up to ${MAX_CM} cm.`}
              </FieldDescription>
            </Field>
            <Button type="submit" disabled={!name.trim() || !cm || create.isPending}>
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
  const [length, setLength] = useState(String(size.lengthCm))
  const [unit, setUnit] = useState<LengthUnit>("cm")
  const update = useUpdateBoxSize()
  const remove = useDeleteBoxSize()
  const cm = lengthOf(length, unit)
  const removable = !size.builtIn && size.boxCount === 0

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input aria-label="Size name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </TableCell>
        <TableCell colSpan={3}>
          <div className="max-w-xs space-y-1">
            <LengthInput id={`len-${size.code}`} value={length} unit={unit} onValue={setLength} onUnit={setUnit} />
            <p className="text-muted-foreground text-xs">
              {cm ? formatLength(cm) : `1–${MAX_CM} cm`}
              {size.boxCount > 0 && " · boxes already registered keep their length"}
            </p>
          </div>
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          <Button
            size="sm"
            disabled={!name.trim() || !cm || update.isPending}
            onClick={() =>
              update.mutate(
                { code: size.code, name, lengthCm: cm ?? undefined },
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
      <TableCell className="tabular-nums">{formatLength(size.lengthCm)}</TableCell>
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
                setLength(String(size.lengthCm))
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
 * Settings → Box sizes (Sprint 11). Standard and Large are built in; admins add their own sizes (a name and the shelf
 * length one box takes). A size in use can be renamed, resized (only boxes registered afterwards take the new length)
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
        description="The sizes staff choose from when registering boxes, and how much shelf space each one takes."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sizes</CardTitle>
            <CardDescription>
              The length is the side of the box along the shelf; it decides how many boxes fit in a rack cell. A new
              length applies to boxes registered from then on — boxes already on a shelf keep theirs, so capacity stays
              right. Retired sizes stay on the boxes that have them but aren&apos;t offered for new ones.
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
                    <TableHead>Shelf length</TableHead>
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
