"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  useAddReferenceUdfMutation,
  useAddReferenceUdfOptionMutation,
  useGetFolderClientsQuery,
  useGetFoldersQuery,
  useGetReferenceUdfOptionsQuery,
  useGetReferenceUdfsQuery,
  useUpdateReferenceUdfMutation,
  type DocusoftReferenceUdf,
} from "@/store/docusoftApi"

// DocuSoft's field type ids on this screen: 1 = Text (with a format), 2 = Combo.
type TypeId = "1" | "2"
// What the Type list offers. DocuSoft keeps Text / Numeric / Date as one type (Text, id 1) with a format
// (String / Integer / Date), so each choice here sets both.
const KINDS = {
  text: { label: "Text", typeId: "1", format: "String" },
  numeric: { label: "Numeric", typeId: "1", format: "Integer" },
  date: { label: "Date", typeId: "1", format: "Date" },
  combo: { label: "Combo", typeId: "2", format: "" },
} as const
type Kind = keyof typeof KINDS
const kindOf = (typeId: string, format: string): Kind | "" =>
  typeId === "2"
    ? "combo"
    : typeId === "1"
      ? format === "Integer"
        ? "numeric"
        : format === "Date"
          ? "date"
          : "text"
      : ""
const typeLabel = (u: DocusoftReferenceUdf) => {
  const k = kindOf(String(u.UserDefFieldTypeID), u.TextControlValue ?? "")
  return k ? KINDS[k].label : "Other"
}

interface FormState {
  name: string
  tooltip: string
  typeId: TypeId | ""
  format: string
  mandatory: boolean
  updatable: boolean
  hidden: boolean
}

const EMPTY: FormState = {
  name: "",
  tooltip: "",
  typeId: "",
  format: "",
  mandatory: false,
  updatable: false,
  hidden: false,
}

const fromUdf = (u: DocusoftReferenceUdf): FormState => ({
  name: u.Name ?? "",
  tooltip: u.TooltipText ?? "",
  typeId: String(u.UserDefFieldTypeID) === "2" ? "2" : "1",
  format: u.TextControlValue ?? "",
  mandatory: u.Mandatory === "Yes",
  updatable: u.CanUpdate === "Yes",
  hidden: u.UDFHide === "Yes",
})

const errorText = (err: unknown) =>
  typeof err === "object" && err !== null && "message" in err
    ? String((err as { message: unknown }).message)
    : "That didn't work"

/** The option list of a Combo field: what it offers, and adding one more. */
function ComboOptions({
  clientId,
  fieldId,
  fieldName,
}: {
  clientId: string
  fieldId: number | string
  fieldName: string
}) {
  const options = useGetReferenceUdfOptionsQuery({ clientId, fieldId })
  const [addOption, adding] = useAddReferenceUdfOptionMutation()
  const [value, setValue] = useState("")
  const add = async () => {
    const v = value.trim()
    if (!v) return
    if (options.data?.some((o) => o.Value.trim().toLowerCase() === v.toLowerCase())) {
      toast.error(`"${v}" is already in the list`)
      return
    }
    try {
      await addOption({ clientId, fieldId, fieldName, value: v }).unwrap()
      setValue("")
      toast.success("Option added")
    } catch (err) {
      toast.error(errorText(err))
    }
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Options of {fieldName}</p>
      {options.isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : options.isError ? (
        <p className="text-destructive text-sm">The options couldn&apos;t be loaded.</p>
      ) : options.data && options.data.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.data.map((o) => (
            <Badge key={String(o.ListID)} variant="secondary">
              {o.Value}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No options yet.</p>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="New option"
          value={value}
          maxLength={100}
          placeholder="New option"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="outline" onClick={add} disabled={!value.trim() || adding.isLoading}>
          {adding.isLoading ? "Adding…" : "Add option"}
        </Button>
      </div>
    </div>
  )
}

/**
 * DocuSoft's "DMS Reference UDFs", like DocuSoft's own DMS Reference UDF tab: pick a folder (Json_GetFolders), then a
 * client of that folder (Json_GetClientsByFolder), then see / add / edit that client's fields in that folder. They are
 * DocuSoft's own fields — read and saved straight in DocuSoft, never in our database — and separate from the box fields
 * below. Independent of the client picker of the Custom fields screen.
 */
export function DocusoftReferenceFieldsCard() {
  const folders = useGetFoldersQuery()
  const [projectId, setProjectId] = useState<number | undefined>(undefined)
  const [clientId, setClientId] = useState("")
  const folderClients = useGetFolderClientsQuery(projectId ?? 0, {
    skip: !projectId,
  })
  const clients = [...(folderClients.data ?? [])].sort((a, b) => a.Client.localeCompare(b.Client))

  const folderName = (id: number) => folders.data?.find((f) => f.FolderID === id)?.Folder ?? String(id)
  const clientName = (id: string) => clients.find((c) => c.ClientID === id)?.Client ?? id

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DocuSoft reference fields</CardTitle>
        <CardDescription>
          DocuSoft&apos;s own fields of a client (DMS Reference UDFs), kept in DocuSoft — not the box fields below. Pick
          a folder, then a client of that folder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ref-folder">Folder</FieldLabel>
            <Select
              value={projectId ? String(projectId) : ""}
              onValueChange={(v) => {
                if (!v) return
                setProjectId(Number(v))
                setClientId("") // the client list changes with the folder
              }}
            >
              <SelectTrigger id="ref-folder">
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
          </Field>
          <Field>
            <FieldLabel htmlFor="ref-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")} disabled={!projectId}>
              <SelectTrigger id="ref-client">
                <SelectValue
                  placeholder={
                    !projectId
                      ? "Choose a folder first"
                      : folderClients.isFetching
                        ? "Loading clients…"
                        : clients.length === 0
                          ? "No clients in this folder"
                          : "Choose a client"
                  }
                  getLabel={clientName}
                />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.ClientID} value={c.ClientID}>
                    {c.Client}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {folders.isError ? (
          <p className="text-destructive text-sm">DocuSoft folders couldn&apos;t be loaded. Sign in again and retry.</p>
        ) : folderClients.isError ? (
          <p className="text-destructive text-sm">{errorText(folderClients.error)}</p>
        ) : projectId && clientId ? (
          // key: a fresh form for every folder + client
          <ReferenceFieldsEditor key={`${projectId}:${clientId}`} clientId={clientId} projectId={projectId} />
        ) : null}
      </CardContent>
    </Card>
  )
}

/** One client's reference fields in one folder: the list, plus the add / edit form. Also used by the top bar's Add client. */
export function ReferenceFieldsEditor({ clientId, projectId }: { clientId: string; projectId: number }) {
  const udfs = useGetReferenceUdfsQuery({ clientId, projectId })
  const [addUdf, adding] = useAddReferenceUdfMutation()
  const [updateUdf, updating] = useUpdateReferenceUdfMutation()

  // The same three-button flow as DocuSoft's DMS Reference UDF tab (docusoftpractice main_js/settings.js):
  //  idle — the form is locked; only Add can be pressed
  //  new  — Add was pressed: an empty, unlocked form; Save adds the field (Update off)
  //  edit — a field was picked in the list: its values, unlocked; Update saves the changes (Save off, Add on)
  const [mode, setMode] = useState<"idle" | "new" | "edit">("idle")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const selected = mode === "edit" ? udfs.data?.find((u) => String(u.UserDefFieldID) === selectedId) : undefined
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const saving = adding.isLoading || updating.isLoading
  const locked = mode === "idle" || saving

  const [tried, setTried] = useState(false) // a Save / Update was pressed with something missing

  const startNew = () => {
    setTried(false)
    setMode("new")
    setSelectedId(null)
    setForm(EMPTY)
  }
  const pick = (u: DocusoftReferenceUdf) => {
    setTried(false)
    setMode("edit")
    setSelectedId(String(u.UserDefFieldID))
    setForm(fromUdf(u))
  }

  // DocuSoft's Save asks for both the label and the tooltip ("Please Fill All Fields").
  const problem =
    mode === "idle"
      ? null
      : !form.name.trim()
        ? "Give the field a label"
        : !form.tooltip.trim()
          ? "Give the field a tooltip"
          : !form.typeId
            ? "Choose a type"
            : null

  const save = async () => {
    if (mode === "idle") return
    // As DocuSoft: Save / Update are pressable straight away; what's missing is said on the click.
    if (problem || !form.typeId) {
      setTried(true)
      toast.error(problem ?? "Choose a type")
      return
    }
    const name = form.name.trim()
    if (
      udfs.data?.some(
        (u) => u.Name.trim().toLowerCase() === name.toLowerCase() && String(u.UserDefFieldID) !== selectedId,
      )
    ) {
      toast.error(`There is already a field called "${name}"`)
      return
    }
    const input = {
      clientId,
      projectId,
      name,
      tooltip: form.tooltip.trim(),
      typeId: form.typeId,
      format: form.typeId === "1" ? form.format || "String" : "",
      mandatory: form.mandatory,
      updatable: form.updatable,
      hidden: form.hidden,
    }
    try {
      if (mode === "edit" && selected) {
        await updateUdf({
          ...input,
          fieldId: selected.UserDefFieldID,
        }).unwrap()
        toast.success("Reference UDF updated") // stays on the field, as DocuSoft does
      } else {
        await addUdf(input).unwrap()
        toast.success("Reference UDF added")
        // as DocuSoft: clear and lock the form again, ready for the next Add
        setMode("idle")
        setForm(EMPTY)
      }
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
      {/* the client's fields in this folder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Fields</p>
          <Button variant="ghost" size="sm" onClick={() => udfs.refetch()} disabled={udfs.isFetching}>
            {udfs.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
        {udfs.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : udfs.isError ? (
          <p className="text-destructive text-sm">{errorText(udfs.error)}</p>
        ) : udfs.data && udfs.data.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {udfs.data.map((u) => {
              const id = String(u.UserDefFieldID)
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => pick(u)}
                    aria-pressed={selectedId === id}
                    className={cn(
                      "hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                      selectedId === id && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    <span className="truncate">{u.Name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{typeLabel(u)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-lg border p-3 text-sm">
            No fields for this client in this folder yet.
          </p>
        )}
      </div>

      {/* add a new field, or edit the selected one */}
      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-sm font-medium">
          {mode === "edit" && selected
            ? `Edit ${selected.Name}`
            : mode === "new"
              ? "New field"
              : "Press Add for a new field, or pick one in the list to change it"}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ref-label">Label</FieldLabel>
            <Input
              id="ref-label"
              value={form.name}
              maxLength={100}
              disabled={locked}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ref-tooltip">Tooltip</FieldLabel>
            <Input
              id="ref-tooltip"
              value={form.tooltip}
              maxLength={200}
              disabled={locked}
              onChange={(e) => set("tooltip", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ref-type">Type</FieldLabel>
            <Select
              value={kindOf(form.typeId, form.format)}
              disabled={locked}
              onValueChange={(v) => {
                const k = KINDS[v as Kind]
                setForm((f) => ({ ...f, typeId: k ? k.typeId : "", format: k ? k.format : "" }))
              }}
            >
              <SelectTrigger id="ref-type">
                <SelectValue placeholder="Choose a type" getLabel={(v) => KINDS[v as Kind]?.label ?? v} />
              </SelectTrigger>
              <SelectContent>
                {/* Combo isn't offered for new fields; it shows only for a field DocuSoft already has as Combo */}
                {(Object.keys(KINDS) as Kind[])
                  .filter((k) => k !== "combo" || form.typeId === "2")
                  .map((k) => (
                    <SelectItem key={k} value={k}>
                      {KINDS[k].label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["mandatory", "Mandatory"],
              ["updatable", "Updatable"],
              ["hidden", "Hide"],
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
          {/* Add: a new, empty form (off while one is open) */}
          <Button variant="outline" onClick={startNew} disabled={mode === "new" || saving}>
            Add
          </Button>
          {/* Update: saves the picked field */}
          <Button variant="outline" onClick={save} disabled={mode !== "edit" || saving}>
            {updating.isLoading ? "Updating…" : "Update"}
          </Button>
          {/* Save: adds the new field */}
          <Button onClick={save} disabled={mode !== "new" || saving}>
            {adding.isLoading ? "Saving…" : "Save"}
          </Button>
        </div>

        {selected && String(selected.UserDefFieldTypeID) === "2" && (
          <ComboOptions clientId={clientId} fieldId={selected.UserDefFieldID} fieldName={selected.Name} />
        )}
      </div>
    </div>
  )
}
