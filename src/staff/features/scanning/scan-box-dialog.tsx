"use client"

import Link from "next/link"
import { useState } from "react"

import { useBoxLookup } from "@/api/boxes"
import { useCustomFields } from "@/api/customFields"
import { useCan } from "@/auth/useAuth"
import { useBoxSizeName } from "@/api/settings"
import type { Box } from "@/api/types"
import { CameraScanner } from "@/components/camera-scanner"
import { BarcodeScanner, Camera } from "@/components/icons"
import { StoredLocation } from "@/components/location-path"
import { ScanInput } from "@/components/scan-input"
import { BoxStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"
import { formatDate, formatDateRange } from "@/lib/formatting"
import { ORDER_STATUS_LABEL, ORDER_TYPE_META } from "@/domain/status"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  )
}

/** What a scan shows: who the box belongs to, what's in it, where it is and what's happening to it. */
function BoxQuickView({ box, scanned, onOpen }: { box: Box; scanned: string; onOpen: () => void }) {
  const sizeName = useBoxSizeName()
  const canOperate = useCan("boxes.operate")
  const { data: fieldDefs } = useCustomFields(box.clientId, { includeInactive: true })
  // The client's own fields this box has a value for (what identifies it: FOLDER, SUBFOLDER, CONTENTS …).
  const customRows = (fieldDefs ?? []).flatMap((f) => {
    const raw = box.customFields?.[f.code]
    if (raw === undefined || raw === "") return []
    return [{ code: f.code, name: f.name, value: f.fieldType === "date" ? formatDate(String(raw)) : String(raw) }]
  })
  // After a Re-label the box has a new barcode and the old label no longer scans for operations: say so.
  const oldLabel = box.barcode !== box.boxNumber && box.barcode.toLowerCase() !== scanned.trim().toLowerCase()
  // Boxes that aren't on a shelf (just registered, received, or missing) need a way to put them on one.
  const moveLabel = box.status === "missing" ? "Found — place in a slot" : box.locationPath ? "Move" : "Put on a shelf"
  const showMove =
    box.status !== "destroyed" &&
    (!!box.locationPath || (canOperate && ["unallocated", "received", "missing"].includes(box.status)))
  const warning =
    (box.onHold && `On hold${box.holdReason ? ` — ${box.holdReason}` : ""}`) ||
    (box.status === "quarantined" && `Quarantined${box.quarantineReason ? ` — ${box.quarantineReason}` : ""}`) ||
    (box.status === "missing" && `Missing${box.missingReason ? ` — ${box.missingReason}` : ""}`)
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xl font-semibold">{box.boxNumber}</p>
          <p className="text-muted-foreground text-sm">{box.clientName}</p>
        </div>
        <BoxStatusBadge status={box.status} />
      </div>
      {warning && <p className="bg-status-hold/10 text-status-hold rounded-md px-3 py-2 text-sm">{warning}</p>}
      {oldLabel && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This box has a newer label: its barcode is now <span className="font-mono font-semibold">{box.barcode}</span>. The
          label you scanned is the old one — replace it (Open box → Re-label).
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Row label="Location">
            {box.locationPath ? <StoredLocation path={box.locationPath} className="font-medium" /> : "Not on a shelf"}
          </Row>
        </div>
        <div className="sm:col-span-2">
          <Row label="Description">{box.description}</Row>
        </div>
        {customRows.map((f) => (
          <Row key={f.code} label={f.name}>
            {f.value}
          </Row>
        ))}
        <Row label="Size">{`${sizeName(box.size)}${box.lengthCm ? ` (${box.lengthCm} cm)` : ""}`}</Row>
        <Row label="Filed">{formatDateRange(box.filingDateFrom, box.filingDateTo)}</Row>
        <Row label="Department / reference">{[box.department, box.reference].filter(Boolean).join(" · ")}</Row>
        <Row label="Destroy after">{box.destroyAfter ? formatDate(box.destroyAfter) : ""}</Row>
        <Row label="Pallet number">{box.palletNo}</Row>
        {(box.containerNo || box.containerType) && (
          <Row label="Container">{[box.containerNo, box.containerType].filter(Boolean).join(" · ")}</Row>
        )}
        <Row label="Entry date">{formatDate(box.entryDate ?? box.createdAt)}</Row>
        {box.comments && (
          <div className="sm:col-span-2">
            <Row label="Comments">{box.comments}</Row>
          </div>
        )}
        {box.openOrder && (
          <div className="sm:col-span-2">
            <Row label="On an order">
              <Link href={`/app/orders/${box.openOrder.id}`} onClick={onOpen} className="text-primary hover:underline">
                {box.openOrder.orderNumber}
              </Link>{" "}
              · {ORDER_TYPE_META[box.openOrder.type]?.label ?? box.openOrder.type},{" "}
              {ORDER_STATUS_LABEL[box.openOrder.status] ?? box.openOrder.status}
            </Row>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={`/app/boxes/${box.id}`} onClick={onOpen} />}>
          Open box
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/boxes/${box.id}/history`} onClick={onOpen} />}
        >
          History
        </Button>
        {showMove && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/app/boxes/${box.id}/move`} onClick={onOpen} />}
          >
            {moveLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * "Scan a box" (Sprint 11): the Scan button in the top bar, and any handheld-scanner scan made outside a text field,
 * opens this with the box's details. Also takes a typed barcode / box number, or the camera on a phone or tablet.
 */
export function ScanBoxButton() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [camera, setCamera] = useState(false)
  const { data: box, isFetching, error } = useBoxLookup(code)

  // A scanner gun fired while nothing was focused: show that box straight away.
  useBarcodeScanner((scanned) => {
    setCode(scanned)
    setCamera(false)
    setOpen(true)
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Scan a box">
        <BarcodeScanner className="size-4" aria-hidden />
        <span className="hidden sm:inline">Scan</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setCamera(false)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Scan a box</DialogTitle>
            <DialogDescription>
              Scan the label with a handheld scanner, type the barcode or box number, or use the camera.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {camera ? (
              <CameraScanner
                onDetected={(scanned) => {
                  setCode(scanned)
                  setCamera(false)
                }}
              />
            ) : (
              <ScanInput label="Box barcode or number" onScan={(scanned) => setCode(scanned)} />
            )}
            <Button variant="ghost" size="sm" onClick={() => setCamera((c) => !c)}>
              <Camera className="size-4" aria-hidden />
              {camera ? "Type or use a scanner instead" : "Use the camera"}
            </Button>

            {code && isFetching && <Skeleton className="h-48 w-full" />}
            {code && !isFetching && error && (
              <p className="text-destructive text-sm">
                {error instanceof Error ? error.message : `No box has the barcode ${code}`}
              </p>
            )}
            {code && !isFetching && box && <BoxQuickView box={box} scanned={code} onOpen={() => setOpen(false)} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
