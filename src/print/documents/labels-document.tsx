"use client"

import { useSearchParams } from "next/navigation"
import { useQueries } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { apiClient, parse } from "@/api/client"
import { boxSchema } from "@/api/types"
import { queryKeys } from "@/api/query-keys"
import { BarcodeLabel } from "@/components/barcode-label"
import { Button } from "@/components/ui/button"
import { Printer } from "@/components/icons"

/**
 * Box labels, 100 × 50 mm, one per page. A toolbar (not printed) has the Print button; opened with `autoprint=1` (every
 * "Print labels" button in the app does) the print dialog opens by itself once every label has loaded.
 */
export function LabelsDocument() {
  const searchParams = useSearchParams()
  const boxIds = (searchParams.get("boxIds") ?? "").split(",").filter(Boolean)
  const autoprint = searchParams.get("autoprint") === "1"

  const results = useQueries({
    queries: boxIds.map((id) => ({
      queryKey: queryKeys.boxes.detail(id),
      queryFn: async () => parse(boxSchema, await apiClient.get(`/boxes/${id}`)),
    })),
  })

  const boxes = results.map((r) => r.data).filter((b) => !!b)
  const loading = results.some((r) => r.isPending)
  const failed = results.filter((r) => r.isError).length

  // Once, after the labels (and their barcodes, drawn in an effect) are on the page.
  const printedOnce = useRef(false)
  useEffect(() => {
    if (!autoprint || loading || boxes.length === 0 || printedOnce.current) return
    // the flag is set when it fires, so an effect re-run (React dev runs effects twice) just reschedules it
    const t = setTimeout(() => {
      printedOnce.current = true
      window.print()
    }, 300)
    return () => clearTimeout(t)
  }, [autoprint, loading, boxes.length])

  if (boxIds.length === 0) {
    return (
      <p className="text-muted-foreground p-8 text-sm">
        No boxes specified — open this from a box or the register wizard.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b p-4 print:hidden">
        <Button onClick={() => window.print()} disabled={loading || boxes.length === 0}>
          <Printer className="size-4" aria-hidden />
          Print {boxes.length} label{boxes.length === 1 ? "" : "s"}
        </Button>
        <span className="text-muted-foreground text-sm">
          {loading
            ? "Loading labels…"
            : "Choose your label printer and 100 × 50 mm paper in the print dialog. This bar isn't printed."}
          {failed > 0 && ` ${failed} label${failed === 1 ? "" : "s"} couldn't be loaded.`}
        </span>
      </div>
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
      </div>
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
