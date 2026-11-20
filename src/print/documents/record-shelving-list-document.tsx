"use client"

import { useSearchParams } from "next/navigation"

import { itemLocation, useShelvingList } from "@/api/recordReturns"
import { Button } from "@/components/ui/button"
import { locationText } from "@/domain/location"
import { formatDate } from "@/lib/formatting"

/**
 * Shelving list (Docbox "Listado de recolocación"): the records that came back, in the order of where their box is, so
 * they are put back in one walk. The ids come in the address (?ids=a,b,c) from the Return records screen.
 */
export function RecordShelvingListDocument() {
  const ids = (useSearchParams().get("ids") ?? "").split(",").filter(Boolean)
  const { data, isLoading } = useShelvingList(ids)

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (!data || data.items.length === 0) return <p className="text-muted-foreground p-8 text-sm">Nothing to list.</p>

  return (
    <div className="mx-auto max-w-[190mm] space-y-6 bg-white p-6 text-sm text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <header className="flex items-start justify-between border-b pb-3">
        <h1 className="text-lg font-bold tracking-wide uppercase">Shelving list — records</h1>
        <p className="text-xs text-black/60">{formatDate(new Date().toISOString().slice(0, 10))}</p>
      </header>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Put back at</th>
            <th className="py-1 pr-2">Box</th>
            <th className="py-1 pr-2">Internal code</th>
            <th className="py-1 pr-2">Client</th>
            <th className="py-1">Done</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((i, n) => (
            <tr key={i.id} className="border-b border-black/10 break-inside-avoid">
              <td className="py-1.5 pr-2">{n + 1}</td>
              <td className="py-1.5 pr-2">{itemLocation(i) ? locationText(itemLocation(i)) : ""}</td>
              <td className="py-1.5 pr-2 font-mono">{i.boxNumber}</td>
              <td className="py-1.5 pr-2 font-mono">{i.internalCode}</td>
              <td className="py-1.5 pr-2">{i.clientName}</td>
              <td className="py-1.5">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-black/60">
        {data.items.length} record{data.items.length === 1 ? "" : "s"} — remove each witness slip when the record is back in its box.
      </p>
    </div>
  )
}
