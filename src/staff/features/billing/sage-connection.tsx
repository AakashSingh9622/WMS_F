"use client"

import { useState, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  clearSageTokens,
  connectSage,
  getSageBusiness,
  getSageLedgerAccounts,
  hasSageSession,
  subscribeSageSession,
} from "@/api/sage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * This browser's Sage sign-in. Follows the stored tokens: connecting, disconnecting, or a refresh token Sage no longer
 * accepts (the Sage module clears it) all update every screen at once. "Not connected" while rendering on the server.
 */
export function useSageConnection() {
  const connected = useSyncExternalStore(subscribeSageSession, hasSageSession, () => false)
  const [connecting, setConnecting] = useState(false)

  // Must run straight from a click: connectSage() opens the popup before its first await.
  async function connect() {
    setConnecting(true)
    try {
      await connectSage()
      toast.success("Connected to Sage")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to Sage")
    } finally {
      setConnecting(false)
    }
  }

  return { connected, connecting, connect, disconnect: clearSageTokens }
}

export function useSageBusiness(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["sage", "business"],
    queryFn: getSageBusiness,
    staleTime: Infinity,
    retry: false,
  })
}

export function useSageLedgerAccounts(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["sage", "ledger-accounts"],
    queryFn: async () => getSageLedgerAccounts((await getSageBusiness()).id),
    staleTime: 10 * 60_000,
    retry: false,
  })
}

/** Status line + Connect / Disconnect, for the settings page and the invoice page. */
export function SageConnectionBar({ connection }: { connection: ReturnType<typeof useSageConnection> }) {
  const business = useSageBusiness(connection.connected)
  return (
    <div className="flex flex-wrap items-center gap-3">
      {connection.connected ? (
        <>
          <Badge variant="secondary">Connected</Badge>
          <span className="text-muted-foreground text-sm">
            {business.isLoading
              ? "Checking…"
              : business.error
                ? business.error.message
                : `Sage business: ${business.data?.name ?? business.data?.id}`}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={connection.disconnect}>
            Disconnect
          </Button>
        </>
      ) : (
        <>
          <Badge variant="outline">Not connected</Badge>
          <span className="text-muted-foreground text-sm">Sign in to Sage once in this browser.</span>
          <Button size="sm" className="ml-auto" disabled={connection.connecting} onClick={() => connection.connect()}>
            {connection.connecting ? "Waiting for Sage…" : "Connect to Sage"}
          </Button>
        </>
      )}
    </div>
  )
}
