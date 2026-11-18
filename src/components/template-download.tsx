"use client"

import { toast } from "sonner"

import { Download } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/csv"
import { downloadXlsx } from "@/lib/spreadsheet"

/** "Download template" as Excel or CSV — the same rows either way. `name` has no extension (e.g. "box-import-template"). */
export function TemplateDownload({ name, rows, size = "default" }: { name: string; rows: string[][]; size?: "default" | "sm" }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size={size}
        onClick={() => downloadXlsx(`${name}.xlsx`, rows, "Template").catch(() => toast.error("Couldn't create the Excel file."))}
      >
        <Download /> Template (Excel)
      </Button>
      <Button variant="outline" size={size} onClick={() => downloadCsv(`${name}.csv`, rows)}>
        <Download /> Template (CSV)
      </Button>
    </div>
  )
}
