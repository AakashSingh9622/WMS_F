"use client"

import { useEffect, useState, type ReactNode } from "react"

import { worker } from "@/mocks/browser"

// Module-scoped so React Strict Mode's mount->cleanup->mount double-invoke of
// the effect below (dev only) can't call worker.start() twice — MSW throws
// "cannot configure an already enabled network" on a second start().
let startPromise: Promise<unknown> | null = null
function ensureWorkerStarted() {
  if (!startPromise) {
    startPromise = worker.start({ onUnhandledFrame: "bypass" })
  }
  return startPromise
}

/**
 * Loaded only via next/dynamic(..., { ssr: false }) from providers.tsx — msw/browser's
 * package.json sets its "node" export condition to null, so this module (and its
 * transitive import of mocks/browser.ts) must never enter the server/SSR compilation
 * graph at all, not just be conditionally skipped at runtime.
 */
export function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ensureWorkerStarted().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return null
  return <>{children}</>
}
