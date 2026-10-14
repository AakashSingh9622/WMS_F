"use client"

import { useState } from "react"

import { useMarkLabelsPrinted } from "@/api/boxes"
import { BarcodeLabel } from "@/components/barcode-label"
import { Button } from "@/components/ui/button"
import type { Box } from "@/api/types"

export function LabelsStep({ boxes, onContinue }: { boxes: Box[]; onContinue: () => void }) {
  const markPrinted = useMarkLabelsPrinted()
  const [printed, setPrinted] = useState(false)

  async function printAll() {
    const url = `/print/labels?boxIds=${boxes.map((b) => b.id).join(",")}`
    window.open(url, "_blank")
    await markPrinted.mutateAsync(boxes.map((b) => b.id))
    setPrinted(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Label preview ({boxes.length})</h2>
        <Button type="button" variant="outline" onClick={printAll} disabled={markPrinted.isPending}>
          {markPrinted.isPending ? "Printing…" : "Print all"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
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

      {printed && <p className="text-status-stored text-sm">Labels marked as printed.</p>}

      <Button type="button" onClick={onContinue}>
        Continue to allocate
      </Button>
    </div>
  )
}
