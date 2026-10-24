"use client"

import { PackagePlus } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import { useOrder } from "@/api/orders"
import { useAuditSearch } from "@/api/audit"
import { DetailsStep, emptyDraft, type RegisterDraft } from "@/staff/features/boxes/register/details-step"
import { LabelsStep } from "@/staff/features/boxes/register/labels-step"
import { AllocateStep } from "@/staff/features/boxes/register/allocate-step"
import { RegisterStepper, type RegisterStep } from "@/staff/features/boxes/register/register-stepper"
import { RegisteredHero } from "@/staff/features/boxes/register/registered-hero"
import { Button } from "@/components/ui/button"
import type { Box, LocationPath } from "@/api/types"

const DRAFT_KEY = "register-boxes-draft"
// The batch being worked on: registered boxes, where each one was filed, whether labels were printed, finished. Kept
// in sessionStorage so going back and forth — or refreshing — never loses progress (or registers the boxes twice).
const SESSION_KEY = "register-boxes-session"

interface RegisterSession {
  boxes: Box[]
  placed: Record<string, LocationPath>
  printed: boolean
  finished: boolean
}
const emptySession = (): RegisterSession => ({ boxes: [], placed: {}, printed: false, finished: false })

function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (private mode / storage full) — the wizard still works for this page view
  }
}

export function RegisterBoxesScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId") ?? undefined
  const lockedClientId = searchParams.get("clientId") ?? undefined

  const { data: lockedOrder } = useOrder(orderId ?? "")
  // Receiving new boxes for a collection order: how many were expected, and how many are already registered
  // against it (one "registered" audit event per box registered with this order id).
  const { data: registeredForOrder } = useAuditSearch(
    { orderId, type: "registered", pageSize: 1 },
    { enabled: !!orderId },
  )
  const expectedNewBoxes = lockedOrder?.type === "collection" ? lockedOrder.collection?.expectedNewBoxes : undefined
  const alreadyRegistered = registeredForOrder?.total
  const remainingExpected =
    expectedNewBoxes !== undefined && alreadyRegistered !== undefined
      ? Math.max(expectedNewBoxes - alreadyRegistered, 0)
      : undefined
  const step = (searchParams.get("step") as RegisterStep) || "details"
  const [draft, setDraft] = useState<RegisterDraft>(emptyDraft)
  const [session, setSession] = useState<RegisterSession>(emptySession)

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from a browser-only store on mount
      if (raw) setDraft(JSON.parse(raw))
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) setSession({ ...emptySession(), ...JSON.parse(saved) })
    } catch {
      // ignore corrupt draft
    }
    if (lockedClientId) setDraft((d) => ({ ...d, clientId: lockedClientId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the draft once on mount
  }, [])

  // Default the quantity to the boxes still expected on this order (e.g. 5 expected, 2 registered -> 3), once per
  // visit — after that the user is free to change it. The wizard allows 1–200 boxes at a time.
  const quantityPrefilled = useRef(false)
  useEffect(() => {
    if (quantityPrefilled.current || !orderId || remainingExpected === undefined || remainingExpected < 1) return
    quantityPrefilled.current = true
    const quantity = Math.min(200, remainingExpected)
    setDraft((d) => {
      const next = { ...d, quantity }
      save(DRAFT_KEY, next)
      return next
    })
  }, [orderId, remainingExpected])

  function updateDraft(next: RegisterDraft) {
    setDraft(next)
    save(DRAFT_KEY, next)
  }

  function updateSession(change: (s: RegisterSession) => RegisterSession) {
    setSession((s) => {
      const next = change(s)
      save(SESSION_KEY, next)
      return next
    })
  }

  function goToStep(next: RegisterStep) {
    router.push(
      `/app/boxes/new?step=${next}${orderId ? `&orderId=${orderId}` : ""}${lockedClientId ? `&clientId=${lockedClientId}` : ""}`,
    )
  }

  /** A fresh batch: forget this one (its boxes stay registered) and start at step 1. */
  function startOver() {
    try {
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore
    }
    setSession(emptySession())
    setDraft({ ...emptyDraft(), clientId: lockedClientId ?? "" })
    goToStep("details")
  }

  /** Wrap up the batch and show the summary (Finish, or automatically once the last box is filed). */
  function finish() {
    updateSession((s) => ({ ...s, finished: true }))
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore
    }
    goToStep("done")
  }

  const hasBoxes = session.boxes.length > 0
  const canOpen = (s: RegisterStep) =>
    s === "details" || ((s === "labels" || s === "allocate") && hasBoxes) || (s === "done" && session.finished)
  const unfiled = session.boxes.filter((b) => !session.placed[b.id]).length

  return (
    <div className="space-y-6">
      {step !== "done" && (
        <PageHeader
          icon={PackagePlus}
          title="Register boxes"
          description="Add boxes, print their labels, then put them on a shelf."
          actions={
            hasBoxes ? (
              <Button variant="ghost" size="sm" onClick={startOver}>
                Start a new batch
              </Button>
            ) : undefined
          }
        />
      )}
      <RegisterStepper current={step} canOpen={canOpen} onOpen={goToStep} />

      {step === "details" && (
        <DetailsStep
          draft={draft}
          onDraftChange={updateDraft}
          lockedClientId={lockedClientId}
          orderId={orderId}
          orderLabel={lockedOrder?.orderNumber}
          orderHint={
            expectedNewBoxes !== undefined && alreadyRegistered !== undefined
              ? `${expectedNewBoxes} new box${expectedNewBoxes === 1 ? "" : "es"} expected on this order · ${alreadyRegistered} already registered${remainingExpected === 0 ? " — all expected boxes are in" : ""}`
              : undefined
          }
          registered={session.boxes}
          filedIds={new Set(Object.keys(session.placed))}
          onStartOver={startOver}
          onCreated={(boxes) => {
            updateSession(() => ({ ...emptySession(), boxes }))
            goToStep("labels")
          }}
          onSaved={(boxes, relabel) => {
            updateSession((s) => ({ ...s, boxes, printed: s.printed && !relabel }))
            if (relabel) goToStep("labels")
          }}
        />
      )}

      {step === "labels" && hasBoxes && (
        <LabelsStep
          boxes={session.boxes}
          printed={session.printed}
          onPrinted={() => updateSession((s) => ({ ...s, printed: true }))}
        />
      )}

      {step === "allocate" && hasBoxes && (
        <AllocateStep
          clientId={session.boxes[0].clientId}
          boxes={session.boxes}
          placed={session.placed}
          onPlaced={(updated) => {
            const placed = { ...session.placed }
            for (const b of updated) if (b.locationPath) placed[b.id] = b.locationPath
            updateSession((s) => ({ ...s, placed: { ...s.placed, ...placed } }))
            // Nothing left to do on this step once the last box is on a shelf — straight to the summary.
            if (session.boxes.every((b) => placed[b.id])) finish()
          }}
          onShowSummary={finish}
        />
      )}

      {step === "done" && hasBoxes && (
        <RegisteredHero
          boxes={session.boxes}
          placed={session.placed}
          orderId={orderId}
          onRegisterMore={startOver}
          onFileRest={() => goToStep("allocate")}
        />
      )}

      {step !== "details" && !hasBoxes && (
        <p className="text-muted-foreground text-sm">
          No boxes in this session yet —{" "}
          <Link href="/app/boxes/new" className="text-primary hover:underline">
            start over
          </Link>
          .
        </p>
      )}

      {/* Back / next for the steps after registering (step 1's own button registers the boxes). */}
      {hasBoxes && step !== "done" && (
        <div className="bg-background/95 sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t px-1 py-3 backdrop-blur">
          <Button
            variant="outline"
            disabled={step === "details"}
            onClick={() => goToStep(step === "allocate" ? "labels" : "details")}
          >
            ← Back
          </Button>
          <span className="text-muted-foreground hidden text-sm sm:block">
            {session.boxes.length} box{session.boxes.length === 1 ? "" : "es"} · {session.boxes.length - unfiled} filed
          </span>
          {step === "details" && <Button onClick={() => goToStep("labels")}>Next: print labels →</Button>}
          {step === "labels" && <Button onClick={() => goToStep("allocate")}>Next: file boxes →</Button>}
          {step === "allocate" && (
            <Button variant={unfiled > 0 ? "outline" : "default"} onClick={finish}>
              {unfiled > 0 ? `Finish (${unfiled} left to file later)` : "Finish →"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
