"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useMySignature, useRemoveSignature } from "@/api/me"
import { useAuth } from "@/auth/useAuth"
import { Signature as SignatureIcon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/formatting"
import { SignatureEditor, SignatureImage } from "@/staff/features/profile/signature-editor"

const HOW: Record<string, string> = { drawn: "Drawn", typed: "Typed", uploaded: "Uploaded picture" }

/** My signature: what goes on the certificates of destruction I sign. Any staff member, for themselves. */
export function SignatureScreen() {
  const { user } = useAuth()
  const { data: signature, isLoading } = useMySignature()
  const remove = useRemoveSignature()
  const [editing, setEditing] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={SignatureIcon}
        title="My signature"
        description="Goes on every certificate of destruction you sign when you mark boxes as destroyed."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {signature && !editing ? "Your signature" : "Add your signature"}
            </CardTitle>
            <CardDescription>
              Draw it, type your name in a handwriting style, or upload a picture of it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : signature && !editing ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-white p-6">
                  <SignatureImage signature={signature} className="max-h-28" />
                </div>
                <p className="text-muted-foreground text-xs">
                  {HOW[signature.kind]}
                  {signature.font ? ` · ${signature.font}` : ""}
                  {signature.updatedAt ? ` · saved ${formatDateTime(signature.updatedAt)}` : ""}
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(true)}>Change signature</Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(undefined, {
                        onSuccess: () => toast.success("Signature removed"),
                        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove it"),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <SignatureEditor defaultName={user?.name ?? ""} onSaved={() => setEditing(false)} />
                {editing && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Keep the current one
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it is used</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>
              When you mark a destruction order&apos;s boxes as destroyed, your signature is printed on its certificate.
            </p>
            <p>
              The certificate keeps the signature it was signed with — changing or removing yours later doesn&apos;t
              alter certificates already issued.
            </p>
            <p>Without a signature you can&apos;t mark boxes as destroyed; you&apos;ll be asked to add one then.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
