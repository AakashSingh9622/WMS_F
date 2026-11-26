"use client"

import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { errorText } from "@/staff/features/clients/client-form-fields"
import {
  GENERAL_NOTE,
  useAddClientNoteMutation,
  useDeleteClientNoteMutation,
  useGetClientNotesQuery,
  useGetNoteTextQuery,
  useSaveNoteTextMutation,
} from "@/store/docusoftApi"

// The colours DocuSoft's own client card gives new notes, in turn.
const NOTE_COLORS = ["#d42027", "#2563eb", "#059669", "#d97706", "#7c3aed"]

/** One note's text: loaded fresh from DocuSoft, edited here, saved back. */
function NoteEditor({
  clientId,
  noteId,
  title,
  onDirty,
  onDelete,
}: {
  clientId: string
  noteId: string
  title: string
  onDirty: (dirty: boolean) => void
  onDelete?: () => void
}) {
  const note = useGetNoteTextQuery({ clientId, noteId })
  if (note.isLoading) return <Skeleton className="h-64 w-full" />
  if (note.isError) return <p className="text-destructive text-sm">{errorText(note.error)}</p>
  // key: a fresh text box whenever DocuSoft's copy changes (after a save)
  return (
    <NoteText
      key={note.data}
      clientId={clientId}
      noteId={noteId}
      title={title}
      saved={note.data ?? ""}
      onDirty={onDirty}
      onDelete={onDelete}
    />
  )
}

function NoteText({
  clientId,
  noteId,
  title,
  saved,
  onDirty,
  onDelete,
}: {
  clientId: string
  noteId: string
  title: string
  saved: string
  onDirty: (dirty: boolean) => void
  onDelete?: () => void
}) {
  const [text, setText] = useState(saved)
  const [save, saving] = useSaveNoteTextMutation()
  const dirty = text !== saved

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onDelete && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} disabled={saving.isLoading}>
            Delete note
          </Button>
        )}
      </div>
      <Textarea
        aria-label={title}
        rows={12}
        value={text}
        placeholder="Write the note…"
        onChange={(e) => {
          setText(e.target.value)
          onDirty(e.target.value !== saved)
        }}
      />
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-muted-foreground mr-auto text-xs">Not saved yet</span>}
        <Button
          variant="outline"
          disabled={!dirty || saving.isLoading}
          onClick={() => {
            setText(saved)
            onDirty(false)
          }}
        >
          Undo changes
        </Button>
        <Button
          disabled={!dirty || saving.isLoading}
          onClick={async () => {
            try {
              await save({ clientId, noteId, text }).unwrap()
              onDirty(false)
              toast.success("Note saved in DocuSoft")
            } catch (err) {
              toast.error(errorText(err))
            }
          }}
        >
          {saving.isLoading ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

/**
 * A client's notes, kept in DocuSoft: the sticky "General" note and DocuSoft's named notes — the same ones DocuSoft's
 * client card shows. Pick a note on the left, write in it, Save; "New note" adds a named one.
 */
export function ClientNotesTab({ clientId }: { clientId: string }) {
  const notes = useGetClientNotesQuery(clientId)
  const [addNote, adding] = useAddClientNoteMutation()
  const [deleteNote] = useDeleteClientNoteMutation()
  const [selected, setSelected] = useState<string>(GENERAL_NOTE)
  const [dirty, setDirty] = useState(false)
  const [switchTo, setSwitchTo] = useState<string | null>(null) // asked: leave unsaved changes?
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null)
  const [newName, setNewName] = useState<string | null>(null) // null = not adding

  const list = [...(notes.data ?? [])].sort((a, b) => String(a.NoteName).localeCompare(String(b.NoteName)))
  const current = list.find((n) => String(n.NoteId) === selected)
  const open = selected === GENERAL_NOTE || current ? selected : GENERAL_NOTE // a deleted note falls back to General

  const choose = (id: string) => {
    if (id === open) return
    if (dirty) return setSwitchTo(id)
    setSelected(id)
  }

  const create = async () => {
    const name = (newName ?? "").trim()
    if (!name) return void toast.error("Give the note a name")
    if (list.some((n) => String(n.NoteName).trim().toLowerCase() === name.toLowerCase())) {
      return void toast.error(`There is already a note called "${name}"`)
    }
    try {
      await addNote({ clientId, name, color: NOTE_COLORS[list.length % NOTE_COLORS.length] }).unwrap()
      setNewName(null)
      toast.success("Note added — write it and Save")
      // DocuSoft gives no id back: open the new note by its name once the list has reloaded
      const reloaded = await notes.refetch()
      const added = (reloaded.data ?? []).filter((n) => String(n.NoteName).trim() === name).pop()
      if (added && !dirty) setSelected(String(added.NoteId))
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[15rem_1fr]">
      <div className="space-y-2">
        <ul className="divide-y rounded-lg border text-sm">
          {[
            { id: GENERAL_NOTE, name: "General", color: "" },
            ...list.map((n) => ({
              id: String(n.NoteId),
              name: String(n.NoteName),
              color: String(n.NoteColor ?? ""),
            })),
          ].map((n) => (
            <li key={n.id}>
              <button
                type="button"
                aria-pressed={open === n.id}
                onClick={() => choose(n.id)}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left",
                  open === n.id && "bg-primary/10 text-primary font-medium",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full border"
                  style={n.color ? { backgroundColor: n.color, borderColor: n.color } : undefined}
                />
                <span className="truncate">{n.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {notes.isLoading && <Skeleton className="h-16 w-full" />}
        {notes.isError && <p className="text-destructive text-xs">{errorText(notes.error)}</p>}

        {newName === null ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setNewName("")}>
            New note
          </Button>
        ) : (
          <div className="space-y-2 rounded-lg border p-2">
            <Input
              aria-label="New note name"
              placeholder="Note name"
              autoFocus
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create()
                if (e.key === "Escape") setNewName(null)
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNewName(null)} disabled={adding.isLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void create()} disabled={adding.isLoading || !newName.trim()}>
                {adding.isLoading ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <NoteEditor
        key={open}
        clientId={clientId}
        noteId={open}
        title={open === GENERAL_NOTE ? "General (sticky note)" : String(current?.NoteName ?? "")}
        onDirty={setDirty}
        onDelete={
          open === GENERAL_NOTE || !current
            ? undefined
            : () => setToDelete({ id: String(current.NoteId), name: String(current.NoteName) })
        }
      />

      <ConfirmDialog
        open={!!switchTo}
        onOpenChange={(o) => !o && setSwitchTo(null)}
        title="Leave this note?"
        description="Your changes to this note aren't saved yet and will be lost."
        confirmLabel="Leave without saving"
        destructive
        onConfirm={() => {
          if (switchTo) {
            setDirty(false)
            setSelected(switchTo)
          }
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? "this note"}?`}
        description="The note and its text are deleted from DocuSoft."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await deleteNote({ clientId, noteId: toDelete.id }).unwrap()
            setDirty(false)
            setSelected(GENERAL_NOTE)
            toast.success("Note deleted")
          } catch (err) {
            toast.error(errorText(err))
          }
        }}
      />
    </div>
  )
}
