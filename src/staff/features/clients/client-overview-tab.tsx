"use client"

import Link from "next/link"

import { useClientCard } from "@/hooks/useClientCard"
import { ClientProfileCard } from "@/staff/features/clients/client-profile-card"
import { ClientUdfValues } from "@/staff/features/clients/udf-values"
import { ClientDocumentCount } from "@/staff/features/clients/client-document-count"
import { ClientReferenceDetails } from "@/staff/features/clients/client-reference-details"
import { ClientAtAGlance } from "@/staff/features/clients/client-at-a-glance"
import { Skeleton } from "@/components/ui/skeleton"

function NeedsFolderNotice() {
  return (
    <p className="text-muted-foreground max-w-xl text-sm">
      DocuSoft needs the folder this client is in. Open the client from the{" "}
      <Link href="/app/clients" className="text-primary hover:underline">
        Clients list
      </Link>{" "}
      after choosing its folder.
    </p>
  )
}

// Overview = the client's name and address, straight from DocuSoft (card + addresses are cached in the
// Redux store when the client is selected, so opening this tab does not fetch again).
export function ClientOverviewTab({ clientId }: { clientId: string }) {
  const { projectId, needsFolder, isLoading, isError } = useClientCard(clientId)

  if (needsFolder) return <NeedsFolderNotice />
  if (isLoading) return <Skeleton className="h-24 w-full max-w-md" />
  if (isError) return <p className="text-destructive text-sm">Could not load this client from DocuSoft.</p>

  return (
    <div className="space-y-8">
      {/* the client in numbers, across the full width */}
      {projectId !== undefined && <ClientAtAGlance clientId={clientId} projectId={projectId} />}
      {/* left: the client and its DocuSoft UDF Details; right: Warehouse details (beside on a wide screen, below on a narrow one) */}
      <div className="grid items-start gap-8 border-t pt-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        <div className="space-y-6">
          {/* the client's header (name, id, Edit client) and its details — from the same client card */}
          <ClientReferenceDetails clientId={clientId} />
          {projectId !== undefined && (
            <section className="space-y-3 border-t pt-6">
              <div>
                <h2 className="text-sm font-semibold">UDF Details</h2>
                <p className="text-muted-foreground text-xs">
                  DocuSoft&apos;s own fields for this client. Every change asks first, then is saved straight in
                  DocuSoft.
                </p>
              </div>
              <ClientUdfValues clientId={clientId} projectId={projectId} />
            </section>
          )}
          {projectId !== undefined && <ClientDocumentCount clientId={clientId} projectId={projectId} />}
        </div>
        <ClientProfileCard clientId={clientId} />
      </div>
    </div>
  )
}
