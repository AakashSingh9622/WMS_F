"use client"

import { useMarkLabelsPrinted } from "@/api/boxes"
import { BarcodeLabel } from "@/components/barcode-label"
import { Printer } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Box } from "@/api/types"

/** Step 2: every label in a wide grid, with printing (which also marks them printed) alongside. */
export function LabelsStep({ boxes, printed, onPrinted }: { boxes: Box[]; printed: boolean; onPrinted: () => void }) {
  const markPrinted = useMarkLabelsPrinted()

  async function printAll() {
    window.open(`/print/labels?boxIds=${boxes.map((b) => b.id).join(",")}&autoprint=1`, "_blank")
    await markPrinted.mutateAsync(boxes.map((b) => b.id))
    onPrinted()
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Label preview ({boxes.length})</CardTitle>
          <CardDescription>100 × 50 mm, one per page on a label printer.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid justify-items-center gap-3 [grid-template-columns:repeat(auto-fill,minmax(100mm,1fr))]">
            {boxes.map((box) => (
              <BarcodeLabel
                key={box.id}
                boxNumber={box.boxNumber}
                barcode={box.barcode}
                clientCode={box.clientId}
                clientName={box.clientName}
                filingDateFrom={box.filingDateFrom}
                filingDateTo={box.filingDateTo}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Print</CardTitle>
            <CardDescription>
              Stick a label on each box before you file it — staff scan it to find the box.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" className="w-full" onClick={printAll} disabled={markPrinted.isPending}>
              <Printer className="size-4" aria-hidden />
              {markPrinted.isPending ? "Printing…" : printed ? "Print again" : `Print ${boxes.length} labels`}
            </Button>
            {printed ? (
              <p className="text-status-stored text-sm">Labels printed and marked as printed.</p>
            ) : (
              <p className="text-muted-foreground text-xs">You can also print later from each box&apos;s page.</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
