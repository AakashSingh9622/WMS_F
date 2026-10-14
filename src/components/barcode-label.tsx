"use client"

import { formatDateRange } from "@/lib/formatting"
import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

export function Barcode({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current) return
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: false,
      height,
      margin: 0,
    })
  }, [value, height])

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />
}

export function BarcodeLabel({
  boxNumber,
  barcode,
  clientCode,
  clientName,
  filingDateFrom,
  filingDateTo,
}: {
  boxNumber: string
  barcode: string
  clientCode: string
  clientName: string
  filingDateFrom: string
  filingDateTo?: string
}) {
  return (
    <div className="flex w-[100mm] flex-col items-center gap-1 border border-black bg-white p-3 text-black print:border-0">
      <div className="text-xs font-medium">
        {clientCode ? `${clientCode} — ` : ""}
        {clientName}
      </div>
      <div className="text-lg font-bold tabular-nums">{boxNumber}</div>
      <Barcode value={barcode} className="w-full" />
      <div className="text-[10px] tabular-nums">{formatDateRange(filingDateFrom, filingDateTo)}</div>
    </div>
  )
}
