import { parseCsv } from "@/lib/csv"

/**
 * Spreadsheet files for the imports and exports: .csv / .txt (parsed by `parseCsv`) and Excel .xlsx.
 * The Excel libraries are loaded only when an .xlsx is actually opened or written, so they cost nothing elsewhere.
 */

export const SPREADSHEET_ACCEPT = ".csv,.txt,.xlsx,text/csv"
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // an import is capped at 500 rows anyway; this only stops a wrong big file

const isExcel = (file: File) => /\.xlsx$/i.test(file.name)
const isCsv = (file: File) => /\.(csv|txt)$/i.test(file.name)

const pad = (n: number) => String(n).padStart(2, "0")

/** One Excel cell as the text the importers expect: dates become YYYY-MM-DD, numbers and booleans plain text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) {
    // Excel dates come back as UTC midnight; read them in UTC so the day never shifts with the browser's time zone.
    const time = value.getUTCHours() || value.getUTCMinutes() ? ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : ""
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}${time}`
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  return String(value)
}

/** Reads a chosen file into rows of text cells (the first row is the header). Throws a readable Error if it can't. */
export async function readTable(file: File): Promise<string[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is too big (10 MB at most).")
  if (isExcel(file)) {
    try {
      const { readSheet } = await import("read-excel-file/browser")
      const rows = await readSheet(file) // the first sheet
      return rows
        .map((row) => row.map(cellText))
        .filter((row) => row.some((c) => c.trim() !== ""))
    } catch {
      throw new Error("This Excel file couldn't be read. Save it again as .xlsx (or as CSV) and try again.")
    }
  }
  if (isCsv(file)) return parseCsv(await file.text())
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported. In Excel use File → Save As → Excel Workbook (.xlsx).")
  throw new Error("Choose an Excel (.xlsx) or CSV file.")
}

/** Browser download of an Excel workbook built from rows of text (the first row is the header, in bold). */
export async function downloadXlsx(filename: string, rows: string[][], sheetName = "Sheet1") {
  const { default: writeExcelFile } = await import("write-excel-file/browser")
  const widths = rows.reduce<number[]>((acc, row) => {
    row.forEach((cell, i) => {
      acc[i] = Math.min(60, Math.max(acc[i] ?? 8, String(cell ?? "").length + 2))
    })
    return acc
  }, [])
  const data = rows.map((row, r) =>
    row.map((value) => ({
      type: String,
      value: String(value ?? ""),
      format: "@", // keep it as text: Excel must not turn "00123" or "3-1" into a number or a date
      ...(r === 0 ? { fontWeight: "bold" as const } : {}),
    }))
  )
  await writeExcelFile(data, {
    sheet: sheetName,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
  }).toFile(filename)
}
