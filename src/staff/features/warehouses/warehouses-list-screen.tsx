"use client"

import { MapPin } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Warehouse as WarehouseIcon } from "@/components/icons"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useCreateWarehouse, useWarehouses } from "@/api/warehouses"
import type { Warehouse } from "@/api/types"
import { CapacityBar } from "@/components/capacity-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

function onError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "That didn't work")
}

// Same rule as the backend: names (and codes) are compared ignoring case and extra spaces.
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()

function AddWarehouseDialog({ existing }: { existing: Warehouse[] }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const createWarehouse = useCreateWarehouse()

  // Instant check against the warehouses already loaded; the server repeats it (and wins any race).
  const nameTaken = useMemo(() => {
    const wanted = normalize(name)
    return wanted !== "" && existing.some((w) => normalize(w.name) === wanted)
  }, [name, existing])
  const codeTaken = useMemo(() => {
    const wanted = normalize(code)
    return wanted !== "" && existing.some((w) => normalize(w.code) === wanted)
  }, [code, existing])
  const nameError = nameTaken ? `A warehouse named "${name.trim()}" already exists` : serverError

  async function submit() {
    setServerError(null)
    try {
      await createWarehouse.mutateAsync({ code, name, address: address || undefined })
      toast.success("Warehouse added")
      setOpen(false)
      setCode("")
      setName("")
      setAddress("")
    } catch (err) {
      // A 409 from the server (e.g. someone else just added the same name) is shown under the field.
      const message = err instanceof Error ? err.message : "That did not work"
      if (/already exists/i.test(message)) setServerError(message)
      else onError(err)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setServerError(null)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Add warehouse</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add warehouse</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="wh-code">Code</FieldLabel>
            <Input
              id="wh-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WH3"
              aria-invalid={codeTaken}
            />
            <FieldError errors={codeTaken ? [{ message: `Code "${code.trim()}" is already used` }] : undefined} />
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-name">Name</FieldLabel>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setServerError(null)
              }}
              placeholder="East Warehouse"
              aria-invalid={!!nameError}
            />
            <FieldError errors={nameError ? [{ message: nameError }] : undefined} />
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-address">Address (optional)</FieldLabel>
            <Input id="wh-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!code || !name || nameTaken || codeTaken || createWarehouse.isPending}>
            {createWarehouse.isPending ? "Adding…" : "Add warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WarehousesListScreen() {
  const canManageLayout = useCan("layout.manage")
  const { data: warehouses, isLoading, isError } = useWarehouses()

  return (
    <div className="space-y-4">
      <PageHeader
        icon={MapPin}
        title="Warehouses"
        description="Storage capacity across every site."
        actions={canManageLayout ? <AddWarehouseDialog existing={warehouses ?? []} /> : undefined}
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {isError && <p className="text-destructive text-sm">Couldn&apos;t load warehouses. Try refreshing.</p>}

      {warehouses && warehouses.length === 0 && <p className="text-muted-foreground text-sm">No warehouses yet.</p>}

      {warehouses && warehouses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {warehouses.map((warehouse) => (
            <Link key={warehouse.id} href={`/app/warehouses/${warehouse.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <WarehouseIcon className="text-primary size-4" />
                    {warehouse.code} — {warehouse.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {warehouse.address && <p className="text-muted-foreground text-sm">{warehouse.address}</p>}
                  <p className="text-muted-foreground text-xs">
                    {warehouse.rackCount} racks · {warehouse.slotCount} slots
                  </p>
                  <CapacityBar used={warehouse.usedCapacity} total={warehouse.totalCapacity} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
