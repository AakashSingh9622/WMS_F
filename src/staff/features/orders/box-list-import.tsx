"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"

import { useResolveBoxes, type ResolvedBox } from "@/api/boxes"
import type { OrderType } from "@/api/types"
import { TemplateDownload } from "@/components/template-download"
import { readTable, SPREADSHEET_ACCEPT } from "@/lib/spreadsheet"

const BOX_HEADERS = ["box", "boxnumber", "barcode", "boxbarcode", "internalcode", "codinterno"]
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")

/**
 * "Add boxes from a file" for an order (Docbox "Expurgo": the client's list of boxes to destroy). Reads the Box column
 * of a CSV, finds each box for this client and order type, and hands the usable ones to the form. Boxes that can't
 * be used are listed with the reason. The order itself is created normally, so legal holds, the client's
 * authorisation and the second signature still apply.
 */
export function BoxListImport({
  clientId,
  type,
  onBoxes,
}: {
  clientId: string
  type: OrderType
  /** Ids of the boxes found and allowed for this order. */
  onBoxes: (ids: string[]) => void
}) {
  const resolve = useResolveBoxes()
  const fileInput = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<ResolvedBox[]>([])
  const [summary, setSummary] = useState("")

  async function onFile(file: File | undefined) {
    setProblems([])
    setSummary("")
    if (!file) return
    let grid: string[][]
    try {
      grid = await readTable(file)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file couldn't be read.")
      if (fileInput.current) fileInput.current.value = ""
      return
    }
    const headerAt = (grid[0] ?? []).findIndex((h) => BOX_HEADERS.includes(norm(h)))
    const col = headerAt >= 0 ? headerAt : 0
    const codes = (headerAt >= 0 ? grid.slice(1) : grid).map((r) => (r[col] ?? "").trim()).filter(Boolean)
    if (codes.length === 0) return toast.error("No box codes found in the file.")
    if (codes.length > 500) return toast.error("At most 500 boxes per file — split it.")
    resolve.mutate(
      { codes, clientId, orderType: type },
      {
        onSuccess: ({ items }) => {
          const ok = items.filter((i) => i.box && !i.problem).map((i) => i.box!.id)
          const bad = items.filter((i) => i.problem)
          onBoxes(ok)
          setProblems(bad)
          setSummary(`${ok.length} of ${items.length} boxes added${bad.length ? `; ${bad.length} can't be used` : ""}.`)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't read the file"),
      }
    )
    if (fileInput.current) fileInput.current.value = ""
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="text-sm"
          aria-label="Excel or CSV file of box codes"
          disabled={resolve.isPending}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <TemplateDownload name="box-list-template" rows={[["Box"], ["BX00000001"]]} size="sm" />
      </div>
      <p className="text-muted-foreground text-xs">
        An Excel or CSV file with a Box column (barcode or box number). The boxes found are added to the selection below.
      </p>
      {summary && <p className="text-sm">{summary}</p>}
      {problems.length > 0 && (
        <ul className="max-h-40 divide-y overflow-auto rounded-md border text-sm">
          {problems.map((p) => (
            <li key={p.code} className="flex gap-3 px-3 py-1.5">
              <span className="w-32 shrink-0 truncate font-medium">{p.code}</span>
              <span className="text-muted-foreground">{p.problem}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
