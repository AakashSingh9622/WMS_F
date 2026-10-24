"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import {
  useLegalHolds,
  usePlaceLegalHold,
  useReleaseLegalHold,
  useRetentionRules,
  type LegalHold,
  type PlaceHoldInput,
} from "@/api/records"
import { useCan } from "@/auth/useAuth"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { formatDate, formatDateTime } from "@/lib/formatting"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

/** Place a legal hold. `box` given = a hold on that one box; otherwise choose client or retention category. */
export function PlaceHoldDialog({
  box,
  label = "Place legal hold",
}: {
  box?: { id: string; boxNumber: string }
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<PlaceHoldInput["scope"]>(box ? "box" : "client")
  const [clientId, setClientId] = useState("")
  const [category, setCategory] = useState("")
  const [authority, setAuthority] = useState("")
  const [reason, setReason] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const place = usePlaceLegalHold()
  const { data: clients } = useGetClientsWithDetailsQuery(undefined, { skip: !!box })
  const { data: rules } = useRetentionRules()
  const clientName = (id: string) => clients?.find((c) => c.ClientId === id)?.Client ?? id
  const targetOk = scope === "box" ? !!box : scope === "client" ? !!clientId : !!category
  const valid = targetOk && authority.trim() && reason.trim()

  async function submit() {
    try {
      await place.mutateAsync({
        scope,
        boxId: box?.id,
        clientId: scope === "client" ? clientId : undefined,
        clientName: scope === "client" ? clientName(clientId) : undefined,
        category: scope === "category" ? category : undefined,
        authority: authority.trim(),
        reason: reason.trim(),
        endsAt: endsAt || undefined,
      })
      toast.success("Legal hold placed — covered boxes can't be destroyed")
      setOpen(false)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{box ? `Legal hold on ${box.boxNumber}` : "Place a legal hold"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          {!box && (
            <Field>
              <FieldLabel htmlFor="lh-scope">Covers</FieldLabel>
              <Select value={scope} onValueChange={(v) => setScope((v as PlaceHoldInput["scope"]) ?? scope)}>
                <SelectTrigger id="lh-scope">
                  <SelectValue getLabel={(v) => (v === "client" ? "All boxes of a client" : "A retention category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">All boxes of a client</SelectItem>
                  <SelectItem value="category">A retention category</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          {scope === "client" && (
            <Field>
              <FieldLabel htmlFor="lh-client">Client</FieldLabel>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger id="lh-client">
                  <SelectValue placeholder="Choose a client" getLabel={clientName} />
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
          )}
          {scope === "category" && (
            <Field>
              <FieldLabel htmlFor="lh-cat">Retention category</FieldLabel>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
                <SelectTrigger id="lh-cat">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {rules?.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.code} — {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="lh-auth">Requested by (authority)</FieldLabel>
            <Input
              id="lh-auth"
              placeholder="e.g. High Court, HMRC, client's solicitor"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lh-reason">Reason / case reference</FieldLabel>
            <Textarea id="lh-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lh-end">Ends on (optional)</FieldLabel>
            <Input id="lh-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!valid || place.isPending}>
            {place.isPending ? "Saving…" : "Place hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReleaseDialog({ hold }: { hold: LegalHold }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const release = useReleaseLegalHold()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Release</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release legal hold</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`rel-${hold.id}`}>Why it is released</FieldLabel>
          <Textarea id={`rel-${hold.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button
            disabled={!note.trim() || release.isPending}
            onClick={() =>
              release.mutate(
                { id: hold.id, note: note.trim() },
                { onSuccess: () => (toast.success("Hold released"), setOpen(false)), onError },
              )
            }
          >
            {release.isPending ? "Saving…" : "Release"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function covers(h: LegalHold) {
  if (h.scope === "box")
    return (
      <>
        Box{" "}
        <Link href={`/app/boxes/${h.boxId}`} className="text-primary font-mono hover:underline">
          {h.boxNumber}
        </Link>{" "}
        ({h.clientName})
      </>
    )
  if (h.scope === "client") return <>All boxes of {h.clientName}</>
  return <>Retention category {h.category}</>
}

/** Legal holds (spec §4.4): while active, no box they cover can be destroyed. Only records managers place / release. */
export function LegalHoldsScreen() {
  const canManage = useCan("records.manage")
  const [status, setStatus] = useState<"active" | "released">("active")
  const { data, isLoading } = useLegalHolds({ status, pageSize: 100 })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["active", "released"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "active" ? "Active" : "Released"}
          </Button>
        ))}
        <span className="text-muted-foreground text-xs">A hold on one box is placed from the box&apos;s own page.</span>
        {canManage && (
          <div className="ml-auto">
            <PlaceHoldDialog />
          </div>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.items.length ? (
        <p className="text-muted-foreground text-sm">
          {status === "active" ? "No active legal holds." : "None released yet."}
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border">
          {data.items.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{h.authority}</Badge>
                  <span>{covers(h)}</span>
                </div>
                <p>{h.reason}</p>
                <p className="text-muted-foreground text-xs">
                  From {formatDate(h.startsAt)}
                  {h.endsAt ? ` to ${formatDate(h.endsAt)}` : ", no end date"} · placed by {h.createdBy.name}
                  {h.releasedBy &&
                    ` · released by ${h.releasedBy.name} ${formatDateTime(h.releasedAt ?? "")}: ${h.releaseNote}`}
                </p>
              </div>
              {canManage && h.status === "active" && <ReleaseDialog hold={h} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
