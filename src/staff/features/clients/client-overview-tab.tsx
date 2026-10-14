"use client"

import Link from "next/link"

import { useClientCard } from "@/hooks/useClientCard"
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
  const { name, address, needsFolder, isLoading, isError } = useClientCard(clientId)

  if (needsFolder) return <NeedsFolderNotice />
  if (isLoading) return <Skeleton className="h-24 w-full max-w-md" />
  if (isError) return <p className="text-destructive text-sm">Could not load this client from DocuSoft.</p>

  return (
    <dl className="grid max-w-xl gap-5 sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground text-xs">Name</dt>
        <dd className="text-sm font-medium">{name ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Client ID</dt>
        <dd className="font-mono text-sm">{clientId}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted-foreground text-xs">Address</dt>
        <dd className="text-sm">{address || <span className="text-muted-foreground">No address on file</span>}</dd>
      </div>
    </dl>
  )
}
