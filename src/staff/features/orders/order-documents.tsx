"use client"

import { useEffect, useState, type ReactNode } from "react"
import { UploadIcon } from "lucide-react"

import { BoxCapacityBar } from "@/components/box-capacity-bar"
import { FileTypeIcon } from "@/components/file-type-icon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { BoxUploadForm } from "@/staff/features/boxes/box-upload-tab"

import { useGetDocumentsByBoxNumberQuery, type DocusoftBoxDocument } from "@/store/docusoftApi"
import { formatDate } from "@/lib/formatting"
import { Skeleton } from "@/components/ui/skeleton"

// DocuSoft's field casing is not always the same, so look a field up ignoring case.
function pick(doc: DocusoftBoxDocument, key: string): string {
  const found = Object.keys(doc).find((k) => k.toLowerCase() === key.toLowerCase())
  const v = found ? doc[found] : undefined
  return v === null || v === undefined ? "" : String(v)
}

/**
 * `waiting` holds the request back (the order screen loads its boxes one at a time); `onSettled` fires once this box
 * has finished — loaded or failed — so the next one can start.
 */
export function BoxDocuments({
  boxNumber,
  waiting = false,
  onSettled,
  action,
  location,
}: {
  boxNumber: string
  /** Where the box is, shown under its heading (the order screen passes the line's location). */
  location?: ReactNode
  waiting?: boolean
  onSettled?: () => void
  /** Shown at the right of the box heading (the order screen's Upload button). */
  action?: ReactNode
}) {
  const { data, isLoading, isUninitialized, isError, error } = useGetDocumentsByBoxNumberQuery(boxNumber, {
    skip: waiting,
  })
  const message = (error as { message?: string } | undefined)?.message
  const settled = !waiting && !isLoading && !isUninitialized

  useEffect(() => {
    if (settled) onSettled?.()
  }, [settled, onSettled])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {boxNumber}
          {data && <span className="text-muted-foreground font-normal"> · {data.length} document{data.length === 1 ? "" : "s"}</span>}
        </h3>
        {action}
      </div>
      {location && <div className="text-sm">{location}</div>}
      {data && <BoxCapacityBar used={data.length} className="max-w-sm" />}
      {waiting ? (
        <p className="text-muted-foreground text-sm">Waiting for the previous box…</p>
      ) : isLoading || isUninitialized ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <p className="text-destructive text-sm">Couldn&apos;t load the documents{message ? `: ${message}` : "."}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Reg. no.</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-left">Section</th>
                <th className="p-2 text-left">Item date</th>
                <th className="p-2 text-left">Received</th>
                <th className="p-2 text-left">Size</th>
                <th className="p-2 text-left">Category</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((doc, i) => (
                <tr key={`${pick(doc, "Registration No.")}-${i}`} className="border-t align-top">
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1.5 uppercase">
                      <FileTypeIcon type={pick(doc, "Type")} />
                      {pick(doc, "Type")}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums">{pick(doc, "Registration No.")}</td>
                  <td className="p-2">{pick(doc, "Description")}</td>
                  <td className="p-2">
                    {pick(doc, "Section")}
                    {pick(doc, "SubSection") && (
                      <span className="text-muted-foreground block text-xs">{pick(doc, "SubSection")}</span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">{formatDate(pick(doc, "Item Date").slice(0, 10))}</td>
                  <td className="p-2 whitespace-nowrap">{formatDate(pick(doc, "Received Date").slice(0, 10))}</td>
                  <td className="p-2 whitespace-nowrap">{pick(doc, "FileSize")}</td>
                  <td className="p-2">{pick(doc, "Category")}</td>
                </tr>
              ))}
              {(data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted-foreground p-4 text-center">
                    No documents are recorded against this box in DocuSoft.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UploadButton({
  boxId,
  boxNumber,
  clientId,
  orderId,
}: {
  boxId: string
  boxNumber: string
  clientId: string
  orderId: string
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UploadIcon /> Upload document
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload documents to {boxNumber}</DialogTitle>
        </DialogHeader>
        <BoxUploadForm boxId={boxId} boxNumber={boxNumber} clientId={clientId} orderId={orderId} />
      </DialogContent>
    </Dialog>
  )
}

/** "Document list" tab: what DocuSoft holds for each box on the order — one box at a time, so DocuSoft isn't flooded. */
export function OrderDocuments({
  boxes,
  upload,
}: {
  boxes: { boxNumber: string; boxId?: string; location?: ReactNode }[]
  /** Set when the user may upload to this order's boxes; `clientId` is the order's client. */
  upload?: { clientId: string; orderId: string }
}) {
  const idByNumber = new Map(boxes.filter((b) => b.boxId).map((b) => [b.boxNumber, b.boxId as string]))
  const locationByNumber = new Map(boxes.map((b) => [b.boxNumber, b.location]))
  const unique = [...new Set(boxes.map((b) => b.boxNumber).filter(Boolean))]
  const [done, setDone] = useState(0) // how many boxes, in order, have finished
  if (unique.length === 0) return <p className="text-muted-foreground text-sm">No boxes on this order.</p>
  return (
    <div className="space-y-6">
      {unique.map((n, i) => (
        <BoxDocuments
          key={n}
          boxNumber={n}
          location={locationByNumber.get(n)}
          waiting={i > done}
          onSettled={() => setDone((d) => Math.max(d, i + 1))}
          action={
            upload &&
            idByNumber.has(n) && (
              <UploadButton
                boxId={idByNumber.get(n)!}
                boxNumber={n}
                clientId={upload.clientId}
                orderId={upload.orderId}
              />
            )
          }
        />
      ))}
    </div>
  )
}
