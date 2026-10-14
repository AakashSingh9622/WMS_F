"use client"

import Link from "next/link"

import { useClient } from "@/api/clients"
import { useClientCard } from "@/hooks/useClientCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function ClientDetailHeader({ clientId }: { clientId: string }) {
  const { data: client, isLoading } = useClient(clientId)
  // Name: from the DocuSoft client card (cached in Redux), else the picked client / cached client list.
  const { name: docusoftName } = useClientCard(clientId)

  if (isLoading) return <Skeleton className="h-16 w-full max-w-lg" />
  // Clients live in DocuSoft; /api/clients/:id is still a mock that only knows seeded demo clients,
  // so for a real DocuSoft client we show just its ID plus the quick actions (boxes/orders tabs
  // below are real).
  if (!client) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Client</h1>
          <span className="text-muted-foreground font-mono text-sm">{clientId}</span>
        </div>
        <div className="flex gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/app/orders/new?clientId=${clientId}`} />}
          >
            New order
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/app/boxes/new?clientId=${clientId}`} />}
          >
            Register boxes
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{docusoftName ?? client.name}</h1>
          <span className="text-muted-foreground font-mono text-sm">{client.code}</span>
          <Badge
            variant="outline"
            className={client.status === "active" ? "border-status-stored text-status-stored" : "text-muted-foreground"}
          >
            {client.status}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {client.boxCount} boxes · {client.openOrderCount} open orders
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={`/app/orders/new?clientId=${client.id}`} />}
        >
          New order
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={`/app/boxes/new?clientId=${client.id}`} />}
        >
          Register boxes
        </Button>
      </div>
    </div>
  )
}
