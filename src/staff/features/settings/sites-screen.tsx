"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { MapPin } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useCreateSite, useDeleteSite, useRenameSite, useSites, type Site } from "@/api/sites"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

/** A name box in a dialog: used to add a site and to rename one. */
function NameDialog({
  trigger,
  triggerLabel,
  title,
  initial,
  confirmLabel,
  hint,
  onSave,
}: {
  trigger: React.ReactElement
  triggerLabel: string
  title: string
  initial: string
  confirmLabel: string
  hint?: string
  onSave: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await onSave(name.trim())
      setOpen(false)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName(initial)
      }}
    >
      <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="site-name">Site name</FieldLabel>
          <Input
            id="site-name"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && void save()}
            placeholder="e.g. AVANTO"
          />
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </Field>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SiteCard({ site }: { site: Site }) {
  const rename = useRenameSite()
  const remove = useDeleteSite()
  const [askDelete, setAskDelete] = useState(false)

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{site.name}</p>
          <p className="text-muted-foreground text-sm">
            {site.warehouseCount === 0 ? (
              "No warehouse yet"
            ) : (
              <>
                {site.warehouseCount} warehouse{site.warehouseCount === 1 ? "" : "s"}:{" "}
                {site.warehouses.map((w, i) => (
                  <span key={w.id}>
                    {i > 0 && ", "}
                    <Link href={`/app/warehouses/${w.id}`} className="text-primary underline-offset-4 hover:underline">
                      {w.code} — {w.name}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <NameDialog
            trigger={<Button variant="outline" size="sm" />}
            triggerLabel="Rename"
            title={`Rename ${site.name}`}
            initial={site.name}
            confirmLabel="Rename"
            hint="Its warehouses move to the new name, and the place shown on their boxes is updated."
            onSave={async (newName) => {
              await rename.mutateAsync({ name: site.name, newName })
              toast.success("Site renamed")
            }}
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={site.warehouseCount > 0}
            title={site.warehouseCount > 0 ? "Move its warehouses to another site first" : undefined}
            onClick={() => setAskDelete(true)}
          >
            Delete
          </Button>
        </div>
        <ConfirmDialog
          open={askDelete}
          onOpenChange={setAskDelete}
          title={`Delete ${site.name}?`}
          description="The site is removed. It has no warehouse, so nothing else changes."
          confirmLabel="Delete site"
          destructive
          onConfirm={async () => {
            try {
              await remove.mutateAsync(site.name)
              toast.success("Site deleted")
            } catch (err) {
              onError(err)
            }
          }}
        />
      </CardContent>
    </Card>
  )
}

/** Settings → Sites (Docbox "Administración → Sedes"): the head offices warehouses belong to. */
export function SitesScreen() {
  const { data: sites, isLoading } = useSites()
  const create = useCreateSite()

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        icon={MapPin}
        title="Sites"
        description="The head offices (Sedes) your warehouses belong to. Pick one when you add or edit a warehouse."
        actions={
          <NameDialog
            trigger={<Button size="sm" />}
            triggerLabel="Add site"
            title="Add a site"
            initial=""
            confirmLabel="Add site"
            onSave={async (name) => {
              await create.mutateAsync(name)
              toast.success("Site added")
            }}
          />
        }
      />

      {isLoading && <Skeleton className="h-24 w-full" />}
      {sites?.length === 0 && <p className="text-muted-foreground text-sm">No sites yet. Add one, or type one when you add a warehouse.</p>}
      {sites?.map((site) => (
        <SiteCard key={site.name} site={site} />
      ))}
    </div>
  )
}
