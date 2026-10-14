"use client"

import { useSearchParams } from "next/navigation"
import { useQueries } from "@tanstack/react-query"

import { apiClient, parse } from "@/api/client"
import { boxSchema } from "@/api/types"
import { queryKeys } from "@/api/query-keys"
import { BarcodeLabel } from "@/components/barcode-label"

export function LabelsDocument() {
  const searchParams = useSearchParams()
  const boxIds = (searchParams.get("boxIds") ?? "").split(",").filter(Boolean)

  const results = useQueries({
    queries: boxIds.map((id) => ({
      queryKey: queryKeys.boxes.detail(id),
      queryFn: async () => parse(boxSchema, await apiClient.get(`/boxes/${id}`)),
    })),
  })

  const boxes = results.map((r) => r.data).filter((b) => !!b)

  if (boxIds.length === 0) {
    return <p className="p-8 text-sm text-muted-foreground">No boxes specified — open this from a box or the register wizard.</p>
  }

  return (
    <div className="flex flex-wrap gap-4 p-4 print:gap-0 print:p-0">
      {boxes.map((box) => (
        <div key={box.id} className="print:break-after-page">
          <BarcodeLabel
            boxNumber={box.boxNumber}
            barcode={box.barcode}
            clientCode={box.clientId}
            clientName={box.clientName}
            filingDateFrom={box.filingDateFrom}
            filingDateTo={box.filingDateTo}
          />
        </div>
      ))}
      <style>{`
        @media print {
          @page {
            size: 100mm 50mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  )
}
