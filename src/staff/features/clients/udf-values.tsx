"use client"

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { errorText } from "@/staff/features/clients/client-form-fields"
import {
  useAddClientActivityMutation,
  useGetClientUdfValuesQuery,
  useGetContactUdfValuesQuery,
  useGetContactUdfsQuery,
  useGetLinkedUdfDatesMutation,
  useGetForwardUsersQuery,
  useUpdateClientFieldMutation,
  useUpdateContactFieldMutation,
  type DocusoftContactUdfValue,
  type DocusoftContactUdfValues,
} from "@/store/docusoftApi"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const kindOf = (f: DocusoftContactUdfValue) => {
  const type = s(f.UserDefFieldTypeID)
  if (type === "2") return "list"
  if (type === "10") return "boolean"
  if (type === "15") return "user"
  if (type === "9") return "formula"
  const format = s(f.TextControlValue)
  if (format === "Date") return "date"
  if (format === "Memo") return "memo"
  if (format === "Integer" || format === "Decimal") return "number"
  return "text"
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n: string | number) => String(n).padStart(2, "0")

/**
 * DocuSoft gives dates as yyyy-mm-dd (sometimes with a time), dd/mm/yyyy, "Nov 25 2026 12:00AM" or /Date(ms)/ →
 * yyyy-mm-dd for the date picker. 1900-01-01 is DocuSoft's own "no date" and reads as empty.
 */
function toIsoDate(value: string): string {
  let iso = ""
  const ymd = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const dmy = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  const named = value.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)
  const ms = value.match(/\/Date\((-?\d+)/)
  if (ymd) iso = `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`
  else if (dmy) iso = `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`
  else if (named && MONTHS.includes(named[1].toLowerCase()))
    iso = `${named[3]}-${pad(MONTHS.indexOf(named[1].toLowerCase()) + 1)}-${pad(named[2])}`
  else if (ms) {
    const d = new Date(Number(ms[1]))
    iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return iso.startsWith("1900-01-01") ? "" : iso
}
/** DocuSoft can't store an empty date — its own pages save this instead, and read it back as "no date". */
const EMPTY_DATE = "1900/01/01"
const toDocusoftDate = (iso: string) => (iso ? iso.replaceAll("-", "/") : EMPTY_DATE) // yyyy/mm/dd
const showDate = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "")

/** The value as the editor holds it: a yyyy-mm-dd date, "1"/"0" for a Boolean, else the text. */
function initialValue(f: DocusoftContactUdfValue): string {
  const raw = s(f.UdfValue)
  const kind = kindOf(f)
  if (kind === "date") return toIsoDate(raw)
  if (kind === "boolean") return raw === "1" || raw.toLowerCase() === "true" ? "1" : "0"
  return raw
}

interface Pending {
  field: DocusoftContactUdfValue
  value: string // the editor's value
}

/** A date DocuSoft recalculated from a changed date UDF, waiting for the user to approve it. */
export interface LinkedDate {
  name: string
  udfId: string
  value: string // as DocuSoft gave it
}

/** "UDF Process updated from 12/11/2026 to 13/11/2026" — the same wording DocuSoft's own pages log. */
const activityNote = (name: string, from: string, to: string) =>
  `UDF ${name} updated${from ? ` from ${from}` : ""} to ${to || "empty"}`

/**
 * A client's or a contact's own DocuSoft fields (UDFs) with their values, by tag — as DocuSoft's own pages show them.
 * Every change asks first ("Updating Process to 13/11/2026"), then saves that one field through `saveField`
 * (fieldName = the field's name; dates as yyyy/mm/dd, Boolean as 1 / 0). A field without a value starts switched off;
 * switching it on lets it be filled in, switching a filled one off clears it (after asking).
 */
function UdfValuesEditor({
  projectId,
  data,
  emptyText,
  saveField,
  logChange,
  findLinkedDates,
  collect,
}: {
  projectId: number
  data: { data?: DocusoftContactUdfValues; isLoading: boolean; isError: boolean; error?: unknown }
  emptyText: string
  saveField?: (fieldName: string, fieldValue: string) => Promise<unknown>
  /**
   * Instead of saving: hands each changed value (as DocuSoft takes it; null = back to empty) to the caller, with no
   * question asked — for a contact that doesn't exist yet, saved once it's added.
   */
  collect?: (fieldName: string, fieldValue: string | null) => void
  /** Writes one line to DocuSoft's activity log of the client after a saved change. */
  logChange?: (note: string) => Promise<unknown>
  /** After a date field is saved: the date fields DocuSoft works out from it (client UDFs only). */
  findLinkedDates?: (fieldId: string, date: string) => Promise<LinkedDate[]>
}) {
  const users = useGetForwardUsersQuery(projectId)
  const [tag, setTag] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // typed, not yet confirmed
  const [enabled, setEnabled] = useState<Record<string, boolean>>({}) // switched on by the user
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmed = useRef(false) // Yes was pressed — the dialog's close then isn't a cancel
  const [linked, setLinked] = useState<{ source: string; rows: LinkedDate[] } | null>(null)

  if (data.isLoading) return <Skeleton className="h-48 w-full" />
  if (data.isError) return <p className="text-destructive text-sm">{errorText(data.error)}</p>

  const fields = data.data?.fields ?? []
  const tags = [
    ...new Set([...(data.data?.tags ?? []).map((t) => s(t.TagName)), ...fields.map((f) => s(f.TagName))]),
  ].filter(Boolean)
  if (fields.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>
  }
  const openTag = tag && tags.includes(tag) ? tag : tags[0]
  const inTag = fields.filter((f) => s(f.TagName) === openTag)

  const idOf = (f: DocusoftContactUdfValue) => s(f.UserDefFieldID)
  const valueOf = (f: DocusoftContactUdfValue) => drafts[idOf(f)] ?? initialValue(f)
  const setDraft = (f: DocusoftContactUdfValue, v: string) => setDrafts((d) => ({ ...d, [idOf(f)]: v }))
  const dropDraft = (f: DocusoftContactUdfValue) =>
    setDrafts((d) => {
      const next = { ...d }
      delete next[idOf(f)]
      return next
    })
  // on when there's a value (a 1900-01-01 "no date" counts as none)
  const isOn = (f: DocusoftContactUdfValue) => enabled[idOf(f)] ?? (initialValue(f) !== "" && initialValue(f) !== "0")

  /** Ask before saving — only when the value really changed. */
  const commit = (f: DocusoftContactUdfValue, v: string) => {
    if (collect) {
      // kept with the form, saved later — no question
      const same = v.trim() === initialValue(f)
      if (same) dropDraft(f)
      else setDraft(f, v)
      collect(s(f.Name), same ? null : kindOf(f) === "date" ? toDocusoftDate(v.trim()) : v.trim())
      return
    }
    if (v.trim() === initialValue(f)) return dropDraft(f)
    setPending({ field: f, value: v.trim() })
  }
  /** A value as people read it: dd/mm/yyyy dates, Yes / No. */
  const display = (f: DocusoftContactUdfValue, v: string) => {
    const kind = kindOf(f)
    if (kind === "date") return showDate(v)
    if (kind === "boolean") return v === "1" ? "Yes" : "No"
    return v
  }
  // Memo fields can be long: the question shows the start only (the whole value is still saved).
  const shown = (p: Pending) => {
    const v = display(p.field, p.value) || "empty"
    return v.length > 120 ? `${v.slice(0, 120)}…` : v
  }
  const logged = (note: string) => {
    if (!logChange) return
    logChange(note).catch(() => toast.warning("Saved, but the change couldn't be added to DocuSoft's activity log"))
  }
  const save = async (p: Pending) => {
    const kind = kindOf(p.field)
    const name = s(p.field.Name)
    const fieldValue = kind === "date" ? toDocusoftDate(p.value) : p.value
    if (!saveField) return
    try {
      await saveField(name, fieldValue)
      toast.success(`${p.field.Name} updated`)
      dropDraft(p.field) // the refreshed value from DocuSoft shows now
    } catch (err) {
      toast.error(errorText(err))
      dropDraft(p.field)
      return
    }
    // The change is saved; logging it and the linked dates are extras, so their failures are only warnings.
    logged(activityNote(name, display(p.field, initialValue(p.field)), display(p.field, p.value)))
    if (kind === "date" && p.value && findLinkedDates) {
      try {
        const rows = await findLinkedDates(idOf(p.field), toDocusoftDate(p.value))
        if (rows.length > 0) setLinked({ source: name, rows })
      } catch (err) {
        toast.warning(`Saved, but the dates linked to ${name} couldn't be worked out: ${errorText(err)}`)
      }
    }
  }

  const editor = (f: DocusoftContactUdfValue) => {
    const id = `cudf-${idOf(f)}`
    const kind = kindOf(f)
    const on = isOn(f)
    const value = valueOf(f)
    const blurCommit = { onBlur: () => commit(f, value) }
    switch (kind) {
      case "list": {
        const options = s(f.Options)
          .split("@;")
          .map((o) => o.trim())
          .filter(Boolean)
        return (
          <Select value={value} disabled={!on} onValueChange={(v) => commit(f, v ?? "")}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="---Select---" />
            </SelectTrigger>
            <SelectContent>
              {value && !options.includes(value) && <SelectItem value={value}>{value}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      case "user":
        return (
          <Select value={value} disabled={!on} onValueChange={(v) => commit(f, v ?? "")}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={users.isLoading ? "Loading users…" : "---Select---"} />
            </SelectTrigger>
            <SelectContent>
              {value && !users.data?.some((u) => s(u.ForwardTo) === value) && (
                <SelectItem value={value}>{value}</SelectItem>
              )}
              {users.data?.map((u) => (
                <SelectItem key={s(u.ForwardTo)} value={s(u.ForwardTo)}>
                  {s(u.ForwardTo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "boolean":
        return null // the card's own switch is the value
      case "formula":
        return <Input id={id} value={value} disabled readOnly title="Worked out by DocuSoft" />
      case "date":
        return <Input id={id} type="date" value={value} disabled={!on} onChange={(e) => commit(f, e.target.value)} />
      case "memo":
        return (
          <Textarea
            id={id}
            rows={2}
            maxLength={255}
            value={value}
            disabled={!on}
            onChange={(e) => setDraft(f, e.target.value)}
            {...blurCommit}
          />
        )
      default:
        return (
          <Input
            id={id}
            type={kind === "number" ? "number" : "text"}
            value={value}
            disabled={!on}
            onChange={(e) => setDraft(f, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            {...blurCommit}
          />
        )
    }
  }

  const onSwitch = (f: DocusoftContactUdfValue, next: boolean) => {
    if (kindOf(f) === "boolean") return commit(f, next ? "1" : "0")
    setEnabled((e) => ({ ...e, [idOf(f)]: next }))
    // switching a field with a saved value off clears it in DocuSoft (asked first)
    if (!next && initialValue(f) !== "") commit(f, "")
    if (!next) dropDraft(f)
    if (!next && collect) collect(s(f.Name), null) // switched off before saving: nothing to save for it
  }

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
      <ul className="h-fit divide-y rounded-lg border text-sm">
        {tags.map((t) => (
          <li key={t}>
            <button
              type="button"
              aria-pressed={openTag === t}
              onClick={() => setTag(t)}
              className={cn(
                "hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left",
                openTag === t && "bg-primary/10 text-primary font-medium",
              )}
            >
              <span className="truncate">{t}</span>
              <span aria-hidden>→</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        {inTag.length === 0 && <p className="text-muted-foreground text-sm">No fields in this tag.</p>}
        {inTag.map((f) => {
          const kind = kindOf(f)
          const on = kind === "boolean" ? valueOf(f) === "1" : isOn(f)
          return (
            <div key={idOf(f)} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`cudf-${idOf(f)}`} className="text-sm font-medium">
                  {f.Name}
                </label>
                {kind !== "formula" && (
                  <Switch
                    aria-label={kind === "boolean" ? f.Name : `Fill in ${f.Name}`}
                    checked={on}
                    onCheckedChange={(next) => onSwitch(f, next)}
                  />
                )}
              </div>
              {editor(f)}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (open) return
          // cancelled (not after Yes): put the field back as it was
          if (pending && !confirmed.current) {
            dropDraft(pending.field)
            if (pending.value === "") setEnabled((e) => ({ ...e, [idOf(pending.field)]: true }))
          }
          confirmed.current = false
          setPending(null)
        }}
        title="Update this field?"
        description={pending ? `Updating ${pending.field.Name} to ${shown(pending)}` : ""}
        confirmLabel="Yes"
        onConfirm={async () => {
          confirmed.current = true
          if (pending) await save(pending)
        }}
      />

      {linked && (
        <LinkedDatesDialog
          source={linked.source}
          rows={linked.rows}
          currentOf={(udfId) => {
            const f = fields.find((x) => idOf(x) === udfId)
            return f ? showDate(initialValue(f)) : ""
          }}
          approve={async (row) => {
            const iso = toIsoDate(row.value)
            if (!iso) throw new Error(`DocuSoft gave an unreadable date: ${row.value}`)
            await saveField?.(row.name, toDocusoftDate(iso))
            const before = fields.find((x) => idOf(x) === row.udfId)
            logged(activityNote(row.name, before ? showDate(initialValue(before)) : "", showDate(iso)))
          }}
          onClose={() => setLinked(null)}
        />
      )}
    </div>
  )
}

/**
 * After a date UDF changed: the date fields DocuSoft worked out from it, each with its new date — approved one by one
 * (or all at once) and saved like any other field. Nothing changes until approved, as on DocuSoft's client card.
 */
function LinkedDatesDialog({
  source,
  rows,
  currentOf,
  approve,
  onClose,
}: {
  source: string
  rows: LinkedDate[]
  currentOf: (udfId: string) => string
  approve: (row: LinkedDate) => Promise<void>
  onClose: () => void
}) {
  const [state, setState] = useState<Record<string, "saving" | "done" | "failed">>({})
  const busy = Object.values(state).includes("saving")
  const run = async (row: LinkedDate) => {
    setState((st) => ({ ...st, [row.udfId]: "saving" }))
    try {
      await approve(row)
      setState((st) => ({ ...st, [row.udfId]: "done" }))
    } catch (err) {
      setState((st) => ({ ...st, [row.udfId]: "failed" }))
      toast.error(`${row.name}: ${errorText(err)}`)
    }
  }
  const waiting = rows.filter((r) => state[r.udfId] !== "done")
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Update the linked dates?</DialogTitle>
          <DialogDescription>
            These dates are worked out from {source}. Approve the ones to save in DocuSoft.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border text-sm">
          {rows.map((r) => {
            const now = currentOf(r.udfId)
            const next = showDate(toIsoDate(r.value)) || r.value
            const st = state[r.udfId]
            return (
              <li key={r.udfId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {now ? `${now} → ` : ""}
                    <span className="text-foreground font-medium">{next}</span>
                  </p>
                </div>
                {st === "done" ? (
                  <Badge variant="secondary">Updated</Badge>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(r)}>
                    {st === "saving" ? "Saving…" : st === "failed" ? "Try again" : "Approve"}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {waiting.length === 0 ? "Close" : "Skip the rest"}
          </Button>
          {waiting.length > 1 && (
            <Button
              disabled={busy}
              onClick={async () => {
                for (const r of waiting) await run(r) // one after another, like separate approvals
              }}
            >
              Approve all
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Edit contact → UDF Details: the contact's own fields (Json_GetCRMContactUDFValues), each saved with
 * Json_UpdateContactField — as DocuSoft's contact page (onboard.js) does.
 */
export function ContactUdfValues({
  clientId,
  projectId,
  contactNo,
  onSaved,
}: {
  clientId: string
  projectId: number
  contactNo: string
  /** After a field is saved in DocuSoft (e.g. to copy May borrow / May destroy to the portal's row). */
  onSaved?: (fieldName: string, fieldValue: string) => Promise<unknown>
}) {
  const data = useGetContactUdfValuesQuery({ projectId, clientId, contactNo }, { skip: !contactNo })
  const [updateField] = useUpdateContactFieldMutation()
  const [addActivity] = useAddClientActivityMutation()
  if (!contactNo) return <p className="text-muted-foreground text-sm">This contact has no DocuSoft contact number.</p>
  return (
    <UdfValuesEditor
      projectId={projectId}
      data={data}
      emptyText="This folder has no contact UDFs (Settings → Contact UDF)."
      saveField={async (fieldName, fieldValue) => {
        await updateField({ clientId, projectId, contactNo, fieldName, fieldValue }).unwrap()
        await onSaved?.(fieldName, fieldValue).catch((err) =>
          toast.warning(`Saved in DocuSoft, but: ${errorText(err)}`),
        )
      }}
      logChange={(note) => addActivity({ clientId, note }).unwrap()}
    />
  )
}

/**
 * Add Contact: the folder's contact UDFs (Json_GetUDFDetails — the contact doesn't exist yet, so there are no values to
 * read), filled in with the form. Nothing is saved or asked here: each change goes to `onChange`, and the caller saves
 * them (Json_UpdateContactField) once the contact is added. Same fields and editors as Edit contact → UDF Details.
 */
export function NewContactUdfFields({
  projectId,
  onChange,
}: {
  projectId: number
  onChange: (fieldName: string, fieldValue: string | null) => void
}) {
  const udfs = useGetContactUdfsQuery(projectId)
  const data = useMemo(() => {
    const d = udfs.data
    if (!d) return undefined
    const tagName = (id: unknown) => s(d.tags.find((t) => s(t.TagID) === s(id))?.TagName)
    return {
      tags: d.tags.map((t) => ({ TagName: t.TagName })),
      fields: d.fields.map((f): DocusoftContactUdfValue => ({
        ...f,
        UdfValue: "",
        TagName: tagName(f.Tag) || "General",
        Options: d.options
          .filter((o) => s(o.UserDefFieldID) === s(f.UserDefFieldID))
          .map((o) => s(o.Value))
          .join("@;"),
      })),
    }
  }, [udfs.data])
  return (
    <UdfValuesEditor
      projectId={projectId}
      data={{ data, isLoading: udfs.isLoading, isError: udfs.isError, error: udfs.error }}
      emptyText="This folder has no contact UDFs (Settings → Contact UDF)."
      collect={onChange}
    />
  )
}

/**
 * A client's Overview → UDF Details: the client's own fields in its folder (Json_GetCRMUDFValuesByClientId), each saved
 * with Json_UpdateClientField — as DocuSoft's client card does.
 */
export function ClientUdfValues({ clientId, projectId }: { clientId: string; projectId: number }) {
  const data = useGetClientUdfValuesQuery({ projectId, clientId })
  const [updateField] = useUpdateClientFieldMutation()
  const [addActivity] = useAddClientActivityMutation()
  const [getLinkedDates] = useGetLinkedUdfDatesMutation()
  return (
    <UdfValuesEditor
      projectId={projectId}
      data={data}
      emptyText="This folder has no client UDFs in DocuSoft."
      saveField={(fieldName, fieldValue) => updateField({ clientId, projectId, fieldName, fieldValue }).unwrap()}
      logChange={(note) => addActivity({ clientId, note }).unwrap()}
      findLinkedDates={(fieldId, date) => getLinkedDates({ projectId, fieldId, date }).unwrap()}
    />
  )
}
