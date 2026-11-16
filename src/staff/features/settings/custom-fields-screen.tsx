"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  FIELD_TYPE_LABELS,
  useCreateCustomField,
  useCustomFields,
  useUpdateCustomField,
  type CustomField,
  type CustomFieldType,
} from "@/api/customFields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"

const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "That didn't work")

function FieldRow({ field }: { field: CustomField }) {
  const update = useUpdateCustomField()
  const [name, setName] = useState(field.name)
  const rename = () => {
    const next = name.trim()
    if (!next || next === field.name) return setName(field.name)
    update.mutate({ id: field.id, name: next }, { onError: (e) => (setName(field.name), onError(e)) })
  }
  return (
    <TableRow className={field.active ? "" : "opacity-60"}>
      <TableCell className="text-muted-foreground w-14">{field.code}</TableCell>
      <TableCell>
        <Input
          aria-label={`Name of field ${field.code}`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{FIELD_TYPE_LABELS[field.fieldType]}</Badge>
      </TableCell>
      <TableCell>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={field.required}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ id: field.id, required: e.target.checked }, { onError })}
          />
          Mandatory
        </label>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: field.id, active: !field.active }, { onError })}
        >
          {field.active ? "Switch off" : "Switch on"}
        </Button>
      </TableCell>
    </TableRow>
  )
}

/**
 * Settings → Custom fields (Docbox "Expedientes - Campos"): the extra columns each client's boxes carry — FOLDER,
 * SUBFOLDER, CONTENTS … — typed text / date / number, optionally mandatory. They appear when registering boxes, in the
 * import template, on the box page and in the inventory export. A field is switched off, never deleted.
 */
export function CustomFieldsScreen() {
  const { data: clients } = useGetClientsWithDetailsQuery()
  const [clientId, setClientId] = useState("")
  const fields = useCustomFields(clientId, { includeInactive: true })
  const create = useCreateCustomField()
  const [name, setName] = useState("")
  const [fieldType, setFieldType] = useState<CustomFieldType>("text")
  const [required, setRequired] = useState(false)

  const add = () => {
    if (!name.trim()) return
    create.mutate(
      { clientId, name: name.trim(), fieldType, required },
      {
        onSuccess: () => {
          setName("")
          setRequired(false)
          toast.success("Field added")
        },
        onError,
      }
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Custom fields</h2>
        <p className="text-muted-foreground text-sm">
          The extra details each client keeps about its boxes — for example Folder, Subfolder and Contents.
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor="cf-client">Client</FieldLabel>
        <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
          <SelectTrigger id="cf-client">
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
      </Field>

      {clientId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fields of this client</CardTitle>
              <CardDescription>
                Rename or mark mandatory any time. The type is fixed once created. Switching a field off hides it from
                new boxes; boxes that already have a value keep it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fields.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : fields.data && fields.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead />
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.data.map((f) => (
                      <FieldRow key={`${f.id}:${f.name}`} field={f} />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">No custom fields yet — add the first one below.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a field</CardTitle>
            </CardHeader>
            <CardContent className="grid items-end gap-4 sm:grid-cols-[1fr_9rem_auto_auto]">
              <Field>
                <FieldLabel htmlFor="cf-name">Name</FieldLabel>
                <Input
                  id="cf-name"
                  value={name}
                  maxLength={60}
                  placeholder="e.g. Folder"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cf-type">Type</FieldLabel>
                <Select value={fieldType} onValueChange={(v) => setFieldType((v as CustomFieldType) ?? "text")}>
                  <SelectTrigger id="cf-type">
                    <SelectValue getLabel={(v) => FIELD_TYPE_LABELS[v as CustomFieldType] ?? v} />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                Mandatory
              </label>
              <Button onClick={add} disabled={!name.trim() || create.isPending}>
                Add field
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
