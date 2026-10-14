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
import { Button } from "@/components/ui/button"
import type { Box } from "@/api/types"

const DRAFT_KEY = "register-boxes-draft"
type Step = "details" | "labels" | "allocate" | "done"

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
  const step = (searchParams.get("step") as Step) || "details"
  const [draft, setDraft] = useState<RegisterDraft>(emptyDraft)
  const [createdBoxes, setCreatedBoxes] = useState<Box[]>([])
  const [unallocatedCount, setUnallocatedCount] = useState(0)

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from a browser-only store on mount
      if (raw) setDraft(JSON.parse(raw))
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
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [orderId, remainingExpected])

  function updateDraft(next: RegisterDraft) {
    setDraft(next)
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  function goToStep(next: Step) {
    router.push(
      `/app/boxes/new?step=${next}${orderId ? `&orderId=${orderId}` : ""}${lockedClientId ? `&clientId=${lockedClientId}` : ""}`,
    )
  }

  if (step === "done") {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-lg font-semibold">
          {unallocatedCount > 0 ? `${createdBoxes.length} boxes registered` : "All boxes registered and allocated"}
        </h1>
        {unallocatedCount > 0 && (
          <p className="text-muted-foreground text-sm">
            {unallocatedCount} box{unallocatedCount === 1 ? "" : "es"} still need a slot — they&apos;ll show up on the
            dashboard under unallocated boxes.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/app/boxes/new" />}>
            Register more
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/app/clients/${draft.clientId}/boxes`} />}
          >
            View boxes
          </Button>
          {orderId && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/app/orders/${orderId}`} />}>
              Back to order
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <PageHeader
          icon={PackagePlus}
          title="Register boxes"
          description="Add boxes, print their labels, then put them in a slot."
        />
        <nav className="text-muted-foreground flex gap-2 text-sm">
          <span className={step === "details" ? "text-foreground font-medium" : ""}>1. Details</span>
          <span>→</span>
          <span className={step === "labels" ? "text-foreground font-medium" : ""}>2. Print labels</span>
          <span>→</span>
          <span className={step === "allocate" ? "text-foreground font-medium" : ""}>3. Allocate</span>
        </nav>
      </div>

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
          onCreated={(boxes) => {
            setCreatedBoxes(boxes)
            goToStep("labels")
          }}
        />
      )}

      {step === "labels" && createdBoxes.length > 0 && (
        <LabelsStep boxes={createdBoxes} onContinue={() => goToStep("allocate")} />
      )}

      {step === "allocate" && createdBoxes.length > 0 && (
        <AllocateStep
          clientId={draft.clientId}
          boxes={createdBoxes}
          onFinish={(remaining) => {
            setUnallocatedCount(remaining)
            try {
              sessionStorage.removeItem(DRAFT_KEY)
            } catch {
              // ignore
            }
            goToStep("done")
          }}
        />
      )}

      {(step === "labels" || step === "allocate") && createdBoxes.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No boxes in this session yet —{" "}
          <Link href="/app/boxes/new" className="text-primary hover:underline">
            start over
          </Link>
          .
        </p>
      )}
    </div>
  )
}
