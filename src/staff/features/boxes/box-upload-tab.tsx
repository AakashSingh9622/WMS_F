"use client"

import { useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { toast } from "sonner"
import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon, UploadCloudIcon, XIcon } from "lucide-react"

import { useBox, useRecordDocumentUpload } from "@/api/boxes"
import { MAX_UPLOAD_BYTES, uploadDocumentToBox } from "@/api/boxDocumentUpload"
import { useCan } from "@/auth/useAuth"
import { BoxCapacityBar, BOX_DOCUMENT_CAPACITY } from "@/components/box-capacity-bar"
import { FileTypeIcon } from "@/components/file-type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  docusoftApi,
  useGetDocumentsByBoxNumberQuery,
  useGetFolderClientsQuery,
  useGetFoldersQuery,
  useGetSectionsQuery,
} from "@/store/docusoftApi"
import { getStoredProjectId } from "@/store/docusoftCreds"

type Row = { name: string; status: "waiting" | "uploading" | "done" | "error"; message?: string }

function sizeText(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "Upload documents" tab of a box. */
export function BoxUploadTab({ boxId }: { boxId: string }) {
  const { data: box, isLoading } = useBox(boxId)
  const canUpload = useCan("boxes.operate")
  if (isLoading) return <Skeleton className="h-64 w-full max-w-3xl" />
  if (!box) return null
  if (!canUpload) return <p className="text-muted-foreground text-sm">You don&apos;t have permission to upload documents.</p>
  return <BoxUploadForm boxId={box.id} boxNumber={box.boxNumber} clientId={box.clientId} />
}

/**
 * Files a document in DocuSoft (Json_RegisterItem) and ties it to the box (Json_UpdateItemBoxNumber). Used by the box's
 * Upload tab and by the order screen. `clientId` is the client the Client dropdown starts on. The caller checks permission.
 */
export function BoxUploadForm({
  boxId,
  boxNumber,
  clientId: boxClientId,
  orderId,
}: {
  boxId: string
  boxNumber: string
  clientId: string
  /** Set when uploading from an order, so the upload also shows in that order's Activity. */
  orderId?: string
}) {
  const dispatch = useDispatch()
  const logUpload = useRecordDocumentUpload(boxId)
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: folders } = useGetFoldersQuery()
  const [chosenFolder, setChosenFolder] = useState("")
  // Until the user picks, use the folder of their own ProjectId (saved at login), else the first one.
  const storedId = getStoredProjectId()
  const defaultFolder =
    folders?.find((f) => String(f.FolderID) === storedId)?.FolderID ?? folders?.[0]?.FolderID ?? undefined
  const folderId = chosenFolder || (defaultFolder !== undefined ? String(defaultFolder) : "")
  const folder = folders?.find((f) => String(f.FolderID) === folderId)

  const { data: sections, isFetching: sectionsLoading } = useGetSectionsQuery(Number(folderId), { skip: !folderId })
  // Clients of the chosen folder (Json_GetClientsByFolder), A–Z. Starts on the box's own client when that folder lists it.
  const { data: folderClients, isFetching: clientsLoading } = useGetFolderClientsQuery(Number(folderId), {
    skip: !folderId,
  })
  const clients = [...(folderClients ?? [])].sort((a, b) =>
    (a.Client.trim() || a.ClientID).localeCompare(b.Client.trim() || b.ClientID, undefined, { sensitivity: "base" }),
  )
  const [chosenClient, setChosenClient] = useState<string | null>(null) // null = not touched yet
  const boxClient = clients.find((c) => c.ClientID === boxClientId)
  const clientId = chosenClient ?? boxClient?.ClientID ?? ""
  const client = clients.find((c) => c.ClientID === clientId)
  const [chosenSection, setChosenSection] = useState("")
  const section = sections?.find((s) => String(s.SecID) === chosenSection)

  const [direction, setDirection] = useState<"Incoming" | "Outgoing">("Incoming")
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Documents already in the box (the same cached list the Document list tab shows). Unknown while it loads or if it failed.
  const { data: boxDocs } = useGetDocumentsByBoxNumberQuery(boxNumber)
  const usedSpace = boxDocs?.length
  const spaceLeft = usedSpace === undefined ? undefined : Math.max(0, BOX_DOCUMENT_CAPACITY - usedSpace)
  const overSpace = spaceLeft !== undefined && files.length > spaceLeft

  const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES)
  const ready = !!folder && !!client && !!section && files.length > 0 && !tooBig && !overSpace && !busy
  const missing = [!folder && "folder", !client && "client", !section && "section", files.length === 0 && "a file"].filter(
    (m): m is string => !!m,
  )
  const finished = rows.filter((r) => r.status === "done" || r.status === "error").length
  const failed = rows.filter((r) => r.status === "error").length
  const uploaded = rows.filter((r) => r.status === "done").length
  const allDone = rows.length > 0 && !busy

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  function addFiles(list: File[]) {
    setRows([]) // a new selection clears the last result
    setFiles((current) => {
      const next = [...current]
      for (const f of list) {
        if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f)
      }
      return next
    })
  }

  async function upload() {
    if (!folder || !section || !client) return
    setBusy(true)
    setRows(files.map((f) => ({ name: f.name, status: "waiting" })))
    let done = 0
    const uploadedDocs: { name: string; section: string }[] = []
    let errors = 0
    // One file at a time — big base64 bodies in parallel would only slow DocuSoft down.
    for (const [i, file] of files.entries()) {
      setRow(i, { status: "uploading" })
      try {
        await uploadDocumentToBox(file, {
          folderId: folder.FolderID,
          folderName: folder.Folder,
          sectionId: section.SecID,
          sectionName: section.Sec,
          clientId: client.ClientID,
          clientName: client.Client.trim() || client.ClientID, // some DocuSoft clients have no name
          direction,
          description: files.length === 1 ? description.trim() : "",
          boxNumber: boxNumber,
        })
        done++
        uploadedDocs.push({ name: file.name, section: section.Sec })
        setRow(i, { status: "done" })
      } catch (err) {
        errors++
        setRow(i, { status: "error", message: err instanceof Error ? err.message : "Upload failed" })
      }
    }
    if (done > 0) {
      dispatch(docusoftApi.util.invalidateTags([{ type: "BoxDocs", id: boxNumber }]))
      // Activity / box history. The documents are already in DocuSoft, so a failure here must not look like a failed upload.
      try {
        await logUpload.mutateAsync({ documents: uploadedDocs, orderId })
      } catch {
        toast.warning("Uploaded, but the activity log could not be updated")
      }
    }
    if (errors === 0) {
      toast.success(`${done} document${done === 1 ? "" : "s"} uploaded and linked to ${boxNumber}`)
    } else if (done > 0) {
      toast.warning(`${done} uploaded, ${errors} failed — see the list below`)
    } else {
      toast.error("Nothing was uploaded — see the list below")
    }
    setFiles([])
    setDescription("")
    if (fileInput.current) fileInput.current.value = ""
    setBusy(false)
  }

  return (
    <div className="max-w-3xl space-y-4 pb-6">
      {allDone && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-sm",
            failed === 0
              ? "border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
          )}
        >
          {failed === 0 ? (
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" />
          ) : (
            <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
          )}
          <div>
            <p className="font-medium">
              {failed === 0
                ? `Upload successful — ${uploaded} document${uploaded === 1 ? "" : "s"} added to ${boxNumber}`
                : `${uploaded} uploaded, ${failed} failed`}
            </p>
            <p className="opacity-80">
              {uploaded > 0 && "They now show in the Document list tab. "}
              {failed > 0 && "Check the files marked below."}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where to file</CardTitle>
          <CardDescription>
            The document is filed in DocuSoft under the client you choose and linked to box{" "}
            <span className="text-foreground font-medium">{boxNumber}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="up-folder">Folder *</FieldLabel>
            <Select
              value={folderId}
              onValueChange={(v) => {
                setChosenFolder(v ?? "")
                setChosenSection("") // sections and clients belong to a folder
                setChosenClient(null)
              }}
              disabled={busy}
            >
              <SelectTrigger id="up-folder">
                <SelectValue
                  placeholder="Choose a folder"
                  getLabel={(id) => folders?.find((f) => String(f.FolderID) === id)?.Folder ?? id}
                />
              </SelectTrigger>
              <SelectContent>
                {(folders ?? []).map((f) => (
                  <SelectItem key={f.FolderID} value={String(f.FolderID)}>
                    {f.Folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="up-client">Client *</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setChosenClient(v ?? "")} disabled={busy || !folderId}>
              <SelectTrigger id="up-client">
                <SelectValue
                  placeholder={clientsLoading ? "Loading clients…" : "Choose a client"}
                  getLabel={(id) => {
                    const c = clients.find((x) => x.ClientID === id)
                    return c ? c.Client.trim() || c.ClientID : id
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.ClientID} value={c.ClientID}>
                    {c.Client.trim() || c.ClientID}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!clientsLoading && folderClients && !boxClient && !chosenClient && (
              <p className="text-muted-foreground text-xs">This box&apos;s client isn&apos;t in this folder — choose one.</p>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="up-section">Section *</FieldLabel>
            <Select value={chosenSection} onValueChange={(v) => setChosenSection(v ?? "")} disabled={busy || !folderId}>
              <SelectTrigger id="up-section">
                <SelectValue
                  placeholder={sectionsLoading ? "Loading sections…" : "Choose a section"}
                  getLabel={(id) => sections?.find((s) => String(s.SecID) === id)?.Sec ?? id}
                />
              </SelectTrigger>
              <SelectContent>
                {(sections ?? []).map((s) => (
                  <SelectItem key={s.SecID} value={String(s.SecID)}>
                    {s.Sec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="up-direction">Direction</FieldLabel>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v === "Outgoing" ? "Outgoing" : "Incoming")}
              disabled={busy}
            >
              <SelectTrigger id="up-direction">
                <SelectValue getLabel={(v) => v} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Incoming">Incoming</SelectItem>
                <SelectItem value="Outgoing">Outgoing</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="up-description">Description (optional)</FieldLabel>
            <Input
              id="up-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={files.length > 1 ? "Each file's name is used as its description" : "Defaults to the file name"}
              disabled={busy || files.length > 1}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files *</CardTitle>
          <CardDescription>Up to 20 MB each. They are uploaded one after another.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usedSpace !== undefined && <BoxCapacityBar used={usedSpace} adding={busy ? 0 : files.length} />}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              // Copy first: e.target.files is live, and resetting the input below would empty it.
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = "" // so the same file can be picked again after removing it
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) addFiles(Array.from(e.dataTransfer.files))
            }}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-50",
              dragging ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40",
            )}
          >
            <UploadCloudIcon className="text-muted-foreground size-8" />
            <span className="text-sm font-medium">Drop files here or click to choose</span>
            <span className="text-muted-foreground text-xs">PDF, images, Office files — any type DocuSoft accepts</span>
          </button>

          {files.length > 0 && (
            <ul className="divide-y rounded-md border text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 px-3 py-2">
                  <FileTypeIcon type={f.name} />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className={cn("shrink-0 text-xs", f.size > MAX_UPLOAD_BYTES ? "text-destructive" : "text-muted-foreground")}>
                    {f.size > MAX_UPLOAD_BYTES ? "Over 20 MB · " : ""}
                    {sizeText(f.size)}
                  </span>
                  {!busy && (
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {busy && (
            <div className="space-y-1">
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${rows.length ? (finished / rows.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Uploading {Math.min(finished + 1, rows.length)} of {rows.length}…
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {rows.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-start gap-2">
                  {r.status === "done" && <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                  {r.status === "error" && <TriangleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" />}
                  {r.status === "uploading" && <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin" />}
                  {r.status === "waiting" && <span className="bg-muted-foreground/30 mt-2 ml-1.5 size-1.5 shrink-0 rounded-full" />}
                  <div className="min-w-0">
                    <span className="font-medium break-all">{r.name}</span>
                    <span className="text-muted-foreground">
                      {r.status === "waiting" && " — waiting"}
                      {r.status === "uploading" && " — uploading…"}
                      {r.status === "done" && " — uploaded and linked"}
                    </span>
                    {r.status === "error" && <p className="text-destructive text-xs">{r.message}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={upload} disabled={!ready}>
              {busy ? (
                <>
                  <Loader2Icon className="animate-spin" /> Uploading…
                </>
              ) : (
                `Upload${files.length > 1 ? ` ${files.length} files` : files.length === 1 ? " file" : ""}`
              )}
            </Button>
            {!busy && !ready && missing.length > 0 && (
              <span className="text-muted-foreground text-xs">Still needed: {missing.join(", ")}</span>
            )}
            {!busy && tooBig && <span className="text-destructive text-xs">Remove the file over 20 MB</span>}
            {!busy && overSpace && (
              <span className="text-destructive text-xs">
                {spaceLeft === 0
                  ? "This box is full (100 documents)."
                  : `Only ${spaceLeft} more document${spaceLeft === 1 ? "" : "s"} fit in this box — remove ${files.length - (spaceLeft ?? 0)} file${files.length - (spaceLeft ?? 0) === 1 ? "" : "s"}.`}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
