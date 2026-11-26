"use client"

import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Check, ChevronRight, Pencil, Settings, Shredder, XIcon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getStoredProjectId } from "@/store/docusoftCreds"
import {
  useAddContactUdfMutation,
  useAddContactUdfOptionMutation,
  useCheckContactUdfInUseMutation,
  useDeleteContactUdfMutation,
  useDeleteContactUdfOptionMutation,
  useGetContactUdfsQuery,
  useGetFoldersQuery,
  useUpdateContactUdfMutation,
  useUpdateContactUdfOptionMutation,
  type DocusoftContactUdf,
  type DocusoftContactUdfOption,
} from "@/store/docusoftApi"

// The field types and Text formats DocuSoft's own Contact UDF page offers (docusoftpractice account/ContactUdf.html).
const TYPES: Record<string, string> = {
  "1": "Text",
  "2": "DropDownList",
  "10": "Boolean",
  "15": "UserList",
  "9": "Formula",
}
const FORMATS = ["String", "Integer", "Date", "Memo"]
const OPERATORS = ["+", "-", "*", "/"]
// DocuSoft refuses anything but letters, digits and spaces in a field name or a drop-down option.
const PLAIN = /^[a-zA-Z0-9\s]+$/

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const errorText = (err: unknown) =>
  typeof err === "object" && err !== null && "message" in err
    ? String((err as { message: unknown }).message)
    : "That didn't work — please try again"

interface FormState {
  name: string
  tooltip: string
  typeId: string
  format: string
  tag: string
  formula: string
  forClientView: boolean
  forClientEdit: boolean
}
const EMPTY: FormState = {
  name: "",
  tooltip: "",
  typeId: "",
  format: "",
  tag: "",
  formula: "",
  forClientView: false,
  forClientEdit: false,
}
const fromField = (f: DocusoftContactUdf): FormState => ({
  name: s(f.Name),
  tooltip: s(f.TooltipText),
  typeId: s(f.UserDefFieldTypeID),
  format: FORMATS.includes(s(f.TextControlValue)) ? s(f.TextControlValue) : "",
  tag: s(f.Tag),
  formula: s(f.TextValue),
  forClientView: f.blnForClientView === true,
  forClientEdit: f.blnForClientEdit === true,
})
/** What DocuSoft stores as TextControlValue: the Text format, "Integer" for a Formula, else "0" (as its page sends). */
const formatFor = (f: FormState) => (f.typeId === "1" ? f.format : f.typeId === "9" ? "Integer" : "0")

/** The drop-down options of a DropDownList field: add, rename in place, delete. */
function OptionList({
  projectId,
  fieldId,
  options,
}: {
  projectId: number
  fieldId: number | string
  options: DocusoftContactUdfOption[]
}) {
  const [addOption, adding] = useAddContactUdfOptionMutation()
  const [updateOption, updating] = useUpdateContactUdfOptionMutation()
  const [deleteOption, deleting] = useDeleteContactUdfOptionMutation()
  const [value, setValue] = useState("")
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [toDelete, setToDelete] = useState<DocusoftContactUdfOption | null>(null)
  const busy = adding.isLoading || updating.isLoading || deleting.isLoading

  const check = (v: string, exceptId?: string) => {
    if (!v) return "Type the option first"
    if (!PLAIN.test(v)) return "Only letters, numbers and spaces are allowed in an option"
    if (options.some((o) => s(o.ListID) !== exceptId && s(o.Value).toLowerCase() === v.toLowerCase()))
      return `"${v}" is already in the list`
    return null
  }

  const add = async () => {
    const v = value.trim()
    const problem = check(v)
    if (problem) return void toast.error(problem)
    try {
      await addOption({ projectId, fieldId, value: v }).unwrap()
      setValue("")
      toast.success("Option added")
    } catch (err) {
      toast.error(errorText(err))
    }
  }
  const saveEdit = async () => {
    if (!editing) return
    const v = editing.value.trim()
    const problem = check(v, editing.id)
    if (problem) return void toast.error(problem)
    try {
      await updateOption({ projectId, fieldId, listId: editing.id, value: v }).unwrap()
      setEditing(null)
      toast.success("Option changed")
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Drop-down options</p>
      <div className="flex gap-2">
        <Input
          aria-label="New option"
          placeholder="New option"
          value={value}
          maxLength={100}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <Button variant="outline" onClick={() => void add()} disabled={busy || !value.trim()}>
          {adding.isLoading ? "Adding…" : "Add option"}
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">No options yet.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {options.map((o) => {
            const id = s(o.ListID)
            const isEditing = editing?.id === id
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-1.5">
                {isEditing ? (
                  <Input
                    aria-label="Option"
                    value={editing.value}
                    maxLength={100}
                    autoFocus
                    onChange={(e) => setEditing({ id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEdit()
                      if (e.key === "Escape") setEditing(null)
                    }}
                  />
                ) : (
                  <span className="flex-1 truncate">{o.Value}</span>
                )}
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="sm" aria-label="Save" onClick={() => void saveEdit()} disabled={busy}>
                      <Check className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Cancel" onClick={() => setEditing(null)}>
                      <XIcon className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Rename ${o.Value}`}
                      onClick={() => setEditing({ id, value: s(o.Value) })}
                      disabled={busy}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${o.Value}`}
                      className="text-destructive"
                      onClick={() => setToDelete(o)}
                      disabled={busy}
                    >
                      <Shredder className="size-4" aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this option?"
        description={`"${toDelete?.Value ?? ""}" is removed from the drop-down list in DocuSoft.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await deleteOption({ projectId, fieldId, listId: toDelete.ListID }).unwrap()
            toast.success("Option deleted")
          } catch (err) {
            toast.error(errorText(err))
          }
        }}
      />
    </div>
  )
}

/** The tags of the folder, each opening to its fields (DocuSoft's accordion). */
function TagTree({
  tags,
  fields,
  openTag,
  onToggleTag,
  selectedId,
  onPick,
}: {
  tags: { id: string; name: string }[]
  fields: DocusoftContactUdf[]
  openTag: string | null
  onToggleTag: (id: string) => void
  selectedId: string | null
  onPick: (f: DocusoftContactUdf) => void
}) {
  if (tags.length === 0) return <p className="text-muted-foreground p-3 text-sm">This folder has no tags yet.</p>
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {tags.map((t) => {
        const open = openTag === t.id
        const inTag = fields.filter((f) => s(f.Tag) === t.id).sort((a, b) => s(a.Name).localeCompare(s(b.Name)))
        return (
          <li key={t.id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggleTag(t.id)}
              className={cn(
                "hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left",
                open && "bg-primary/10 text-primary font-medium",
              )}
            >
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-muted-foreground text-xs">{inTag.length}</span>
              <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
            </button>
            {open && (
              <ul className="space-y-0.5 px-2 pb-2">
                {inTag.length === 0 ? (
                  <li className="text-muted-foreground px-3 py-1.5 text-xs">No fields in this tag</li>
                ) : (
                  inTag.map((f) => {
                    const id = s(f.UserDefFieldID)
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          aria-pressed={selectedId === id}
                          onClick={() => onPick(f)}
                          className={cn(
                            "hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left",
                            selectedId === id && "bg-muted font-medium",
                          )}
                        >
                          <span className="truncate">{f.Name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {TYPES[s(f.UserDefFieldTypeID)] ?? "Other"}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The fields of one folder: the tag tree, the form with DocuSoft's Add / Delete / Update / Save flow, the options. */
function ContactUdfEditor({ projectId }: { projectId: number }) {
  const data = useGetContactUdfsQuery(projectId)
  const [addUdf, adding] = useAddContactUdfMutation()
  const [updateUdf, updating] = useUpdateContactUdfMutation()
  const [checkInUse, checking] = useCheckContactUdfInUseMutation()
  const [deleteUdf, deleting] = useDeleteContactUdfMutation()
  const [deleteOptions] = useDeleteContactUdfOptionMutation()

  // As DocuSoft: idle (form locked, only Add) → Add (empty form, Save) → pick a field (its values, Update / Delete)
  const [mode, setMode] = useState<"idle" | "new" | "edit">("idle")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openTag, setOpenTag] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    label: string
    destructive?: boolean
    run: () => Promise<void>
  } | null>(null)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const tags = (data.data?.tags ?? [])
    .map((t) => ({ id: s(t.TagID), name: s(t.TagName) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const fields = data.data?.fields ?? []
  const selected = mode === "edit" ? fields.find((f) => s(f.UserDefFieldID) === selectedId) : undefined
  const optionsOf = (id: string) => (data.data?.options ?? []).filter((o) => s(o.UserDefFieldID) === id)
  const saving = adding.isLoading || updating.isLoading || checking.isLoading || deleting.isLoading
  const locked = mode === "idle" || saving

  const startNew = () => {
    setTried(false)
    setMode("new")
    setSelectedId(null)
    setForm({ ...EMPTY, tag: openTag ?? "" }) // the tag that's open, to start with
  }
  const pick = (f: DocusoftContactUdf) => {
    setTried(false)
    setMode("edit")
    setSelectedId(s(f.UserDefFieldID))
    setForm(fromField(f))
  }
  const toIdle = () => {
    setMode("idle")
    setSelectedId(null)
    setForm(EMPTY)
  }

  const problem = !form.name.trim()
    ? "Give the field a label"
    : !PLAIN.test(form.name.trim())
      ? "Only letters, numbers and spaces are allowed in the label"
      : !form.typeId
        ? "Choose a type"
        : form.typeId === "1" && !form.format
          ? "Choose a format"
          : form.typeId === "9" && !form.formula.trim()
            ? "Write the formula"
            : !form.tag
              ? "Select a tag"
              : null

  const input = () => ({
    projectId,
    name: form.name.trim(),
    tooltip: form.tooltip.trim(),
    typeId: form.typeId,
    format: formatFor(form),
    tag: form.tag,
    formula: form.typeId === "9" ? form.formula.trim() : "",
    forClientView: form.forClientView,
    forClientEdit: form.forClientEdit,
  })
  const duplicate = () =>
    fields.some((f) => s(f.Name).toLowerCase() === form.name.trim().toLowerCase() && s(f.UserDefFieldID) !== selectedId)

  const save = async () => {
    if (problem) {
      setTried(true)
      return void toast.error(problem)
    }
    if (duplicate()) return void toast.error(`There is already a field called "${form.name.trim()}" in this folder`)
    try {
      await addUdf(input()).unwrap()
      toast.success("Contact UDF saved")
      setOpenTag(form.tag)
      toIdle()
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  // DocuSoft refuses to change / delete a field contacts already have values for — asked first, as its page does.
  const blockedIfInUse = async (fieldId: string, what: string) => {
    const inUse = await checkInUse({ projectId, fieldId }).unwrap()
    if (inUse) {
      toast.error(
        `This field already has values on contact records, so it can't be ${what}. Remove those values first, or ask DocuSoft support.`,
      )
    }
    return inUse
  }

  const update = async () => {
    if (!selected || !selectedId) return
    if (problem) {
      setTried(true)
      return void toast.error(problem)
    }
    if (duplicate()) return void toast.error(`There is already a field called "${form.name.trim()}" in this folder`)
    try {
      if (await blockedIfInUse(selectedId, "changed")) return
    } catch (err) {
      return void toast.error(errorText(err))
    }
    const doUpdate = async () => {
      try {
        await updateUdf({ ...input(), fieldId: selected.UserDefFieldID }).unwrap()
        toast.success("Contact UDF updated")
      } catch (err) {
        toast.error(errorText(err))
      }
    }
    const before = fromField(selected)
    const hasOptions = optionsOf(selectedId).length > 0
    if (hasOptions && (form.typeId !== before.typeId || formatFor(form) !== formatFor(before))) {
      setConfirm({
        title: "Delete the drop-down options?",
        description:
          "This field has drop-down options. Changing its type or format deletes all of them permanently. Do you want to go on?",
        label: "Delete options and update",
        destructive: true,
        run: async () => {
          try {
            await deleteOptions({ projectId, fieldId: selected.UserDefFieldID, listId: 0 }).unwrap()
          } catch (err) {
            return void toast.error(errorText(err))
          }
          await doUpdate()
        },
      })
      return
    }
    await doUpdate()
  }

  const remove = async () => {
    if (!selected || !selectedId) return
    try {
      if (await blockedIfInUse(selectedId, "deleted")) return
    } catch (err) {
      return void toast.error(errorText(err))
    }
    const hasOptions = optionsOf(selectedId).length > 0
    setConfirm({
      title: `Delete ${selected.Name}?`,
      description: hasOptions
        ? "The field and all its drop-down options are deleted from DocuSoft permanently."
        : "The field is deleted from DocuSoft permanently.",
      label: "Delete",
      destructive: true,
      run: async () => {
        try {
          if (hasOptions) await deleteOptions({ projectId, fieldId: selected.UserDefFieldID, listId: 0 }).unwrap()
          await deleteUdf({ projectId, fieldId: selected.UserDefFieldID }).unwrap()
          toast.success("Contact UDF deleted")
          toIdle()
        } catch (err) {
          toast.error(errorText(err))
        }
      },
    })
  }

  // A formula is built from the tag's Integer fields and + - * / (DocuSoft's formula builder).
  const numberFields = fields.filter(
    (f) => s(f.Tag) === form.tag && s(f.TextControlValue) === "Integer" && s(f.UserDefFieldID) !== selectedId,
  )

  if (data.isLoading) return <Skeleton className="h-64 w-full" />
  if (data.isError) return <p className="text-destructive text-sm">{errorText(data.error)}</p>

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Tags</p>
          <Button variant="ghost" size="sm" onClick={() => data.refetch()} disabled={data.isFetching}>
            {data.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <TagTree
          tags={tags}
          fields={fields}
          openTag={openTag}
          onToggleTag={(id) => setOpenTag((t) => (t === id ? null : id))}
          selectedId={selectedId}
          onPick={pick}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm font-medium">
            {mode === "edit" && selected
              ? `Edit ${selected.Name}`
              : mode === "new"
                ? "New contact UDF"
                : "Press Add for a new field, or pick one under a tag to change it"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="cu-label">
                Label<span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="cu-label"
                value={form.name}
                maxLength={100}
                disabled={locked}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-tooltip">Tooltip</FieldLabel>
              <Input
                id="cu-tooltip"
                value={form.tooltip}
                maxLength={200}
                disabled={locked}
                onChange={(e) => set("tooltip", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-type">Type</FieldLabel>
              <Select value={form.typeId} disabled={locked} onValueChange={(v) => set("typeId", v ?? "")}>
                <SelectTrigger id="cu-type">
                  <SelectValue placeholder="---Select---" getLabel={(v) => TYPES[v] ?? v} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPES).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.typeId === "1" && (
              <Field>
                <FieldLabel htmlFor="cu-format">Format</FieldLabel>
                <Select value={form.format} disabled={locked} onValueChange={(v) => set("format", v ?? "")}>
                  <SelectTrigger id="cu-format">
                    <SelectValue placeholder="---Select---" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="cu-tag">
                Tag<span className="text-destructive">*</span>
              </FieldLabel>
              <Select value={form.tag} disabled={locked} onValueChange={(v) => set("tag", v ?? "")}>
                <SelectTrigger id="cu-tag">
                  <SelectValue placeholder="---Select---" getLabel={(v) => tags.find((t) => t.id === v)?.name ?? v} />
                </SelectTrigger>
                <SelectContent>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.typeId === "9" && (
            <Field>
              <FieldLabel htmlFor="cu-formula">Formula</FieldLabel>
              <Textarea
                id="cu-formula"
                rows={2}
                value={form.formula}
                disabled={locked}
                placeholder="e.g. Fee * Quantity"
                onChange={(e) => set("formula", e.target.value)}
              />
              {!locked && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Insert:</span>
                  {numberFields.map((f) => (
                    <Badge
                      key={s(f.UserDefFieldID)}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => set("formula", `${form.formula}${f.Name}`)}
                    >
                      {f.Name}
                    </Badge>
                  ))}
                  {OPERATORS.map((op) => (
                    <Badge
                      key={op}
                      variant="outline"
                      className="cursor-pointer font-mono"
                      onClick={() => set("formula", `${form.formula}${op}`)}
                    >
                      {op}
                    </Badge>
                  ))}
                  {numberFields.length === 0 && (
                    <span className="text-muted-foreground">(no Integer fields in this tag yet)</span>
                  )}
                </div>
              )}
            </Field>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["forClientView", "For Client View"],
                ["forClientEdit", "For Client Edit"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={cn("flex items-center gap-2", locked && "opacity-50")}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  disabled={locked}
                  onChange={(e) => set(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {tried && problem && <p className="text-destructive mr-auto text-xs">{problem}</p>}
            <Button variant="outline" onClick={startNew} disabled={mode === "new" || saving}>
              Add
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => void remove()}
              disabled={mode !== "edit" || saving}
            >
              {deleting.isLoading ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="outline" onClick={() => void update()} disabled={mode !== "edit" || saving}>
              {updating.isLoading ? "Updating…" : "Update"}
            </Button>
            <Button onClick={() => void save()} disabled={mode !== "new" || saving}>
              {adding.isLoading ? "Saving…" : "Save"}
            </Button>
          </div>

          {selected && s(selected.UserDefFieldTypeID) === "2" && (
            <OptionList
              projectId={projectId}
              fieldId={selected.UserDefFieldID}
              options={optionsOf(s(selected.UserDefFieldID))}
            />
          )}
          {mode === "new" && form.typeId === "2" && (
            <p className="text-muted-foreground text-xs">Save the field first, then pick it to add its options.</p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.label}
        destructive={confirm?.destructive}
        onConfirm={async () => {
          await confirm?.run()
        }}
      />
    </div>
  )
}

/**
 * Settings → Contact UDF: DocuSoft's own fields for the contacts of a folder (Json_GetUDFDetails, UDFType 2), grouped by
 * tag — the same screen as DocuSoft's Manage UDFs → Contact UDF. Read and saved straight in DocuSoft, never in our
 * database.
 */
export function ContactUdfScreen() {
  const folders = useGetFoldersQuery()
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  const home = Number(getStoredProjectId())
  // the signed-in user's own folder first (DocuSoft's page starts on it), else the first folder
  const projectId =
    chosen ?? (folders.data?.some((f) => f.FolderID === home) ? home : undefined) ?? folders.data?.[0]?.FolderID
  const folderName = (id: number) => folders.data?.find((f) => f.FolderID === id)?.Folder ?? String(id)

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={Settings}
        title="Contact UDF"
        description="DocuSoft's own fields for the contacts of a folder, grouped by tag. Saved in DocuSoft."
        actions={
          <Select value={projectId ? String(projectId) : ""} onValueChange={(v) => v && setChosen(Number(v))}>
            <SelectTrigger className="w-56" aria-label="Folder">
              <SelectValue
                placeholder={folders.isLoading ? "Loading folders…" : "Choose a folder"}
                getLabel={(v) => folderName(Number(v))}
              />
            </SelectTrigger>
            <SelectContent>
              {folders.data?.map((f) => (
                <SelectItem key={f.FolderID} value={String(f.FolderID)}>
                  {f.Folder}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {folders.isError ? (
        <p className="text-destructive text-sm">DocuSoft folders couldn&apos;t be loaded: {errorText(folders.error)}</p>
      ) : !projectId ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        // key: a fresh editor (nothing picked) for every folder
        <ContactUdfEditor key={projectId} projectId={projectId} />
      )}
    </div>
  )
}
