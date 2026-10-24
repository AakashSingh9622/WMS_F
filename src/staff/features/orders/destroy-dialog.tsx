"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useMySignature } from "@/api/me"
import { useDestroyOrder } from "@/api/orders"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SignatureEditor, SignatureImage } from "@/staff/features/profile/signature-editor"

/**
 * "Mark destroyed": witness and place, and the signature of the person doing it — it goes on the certificate of
 * destruction. Without one on file, it is added right here first (the API refuses with SIGNATURE_REQUIRED otherwise).
 */
export function DestroyDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [witness, setWitness] = useState("")
  const [place, setPlace] = useState("")
  const [changing, setChanging] = useState(false)
  const { user } = useAuth()
  const { data: signature, isLoading, refetch } = useMySignature()
  const destroy = useDestroyOrder()
  const needsSignature = !isLoading && (!signature || changing)

  async function submit() {
    try {
      await destroy.mutateAsync({
        orderId,
        input: { witness: witness.trim() || undefined, place: place.trim() || undefined },
      })
      toast.success("Boxes destroyed — the certificate of destruction is ready")
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === "SIGNATURE_REQUIRED") {
        await refetch() // e.g. removed in another tab: ask for it here
        setChanging(true)
      }
      toast.error(err instanceof Error ? err.message : "That didn't work")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setChanging(false)
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Mark destroyed</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirm the boxes were destroyed</DialogTitle>
          <DialogDescription>
            This issues the certificate of destruction, signed by you. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Signed by {user?.name}</h3>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : needsSignature ? (
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">
                {signature
                  ? "Your new signature:"
                  : "You don't have a signature yet — add one to sign the certificate."}
              </p>
              <SignatureEditor defaultName={user?.name ?? ""} onSaved={() => setChanging(false)} />
              {signature && (
                <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
                  Keep the current one
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3">
              <SignatureImage signature={signature!} className="max-h-16" />
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Button size="xs" variant="ghost" onClick={() => setChanging(true)} className="text-gray-700">
                  Change
                </Button>
                <Link href="/app/profile/signature" className="text-xs text-gray-500 hover:underline">
                  My signature
                </Link>
              </div>
            </div>
          )}
        </section>

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="destroy-witness">Witness (optional)</FieldLabel>
              <Input id="destroy-witness" value={witness} onChange={(e) => setWitness(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="destroy-place">Place of destruction (optional)</FieldLabel>
              <Input id="destroy-place" value={place} onChange={(e) => setPlace(e.target.value)} />
            </Field>
          </div>
        </FieldGroup>

        <DialogFooter>
          <Button onClick={submit} disabled={needsSignature || isLoading || destroy.isPending}>
            {destroy.isPending ? "Destroying…" : "Mark destroyed and sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
