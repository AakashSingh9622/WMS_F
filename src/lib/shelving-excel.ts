import { parseCsv } from "@/lib/csv"
import { downloadXlsx } from "@/lib/spreadsheet"

/** Excel sheet and file name for the returns shelving sheet (Docbox "returns shelving sheet"). */
export const SHELVING_SHEET = "To shelve"
export const shelvingFileName = () => `shelving-list-${new Date().toISOString().slice(0, 10)}.xlsx`

/**
 * Downloads the returns shelving sheet as an .xlsx: fetches the backend's record-shelving CSV (already in walking order, location split
 * into columns, dates as YYYY-MM-DD) and writes the same rows with the existing CSV→Excel writer (text cells, bold frozen header).
 * Throws an Error with a readable message when it can't.
 */
export async function downloadShelvingExcel(url: string) {
  const res = await fetch(url, { credentials: "same-origin" })
  if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to this export." : "The export failed. Try again.")
  const rows = parseCsv(await res.text())
  if (rows.length === 0) throw new Error("Nothing to export.")
  await downloadXlsx(shelvingFileName(), rows, SHELVING_SHEET)
}

/** The ids-mode URL: exactly these records (the ones just returned). */
export const shelvingUrlForIds = (ids: string[]) => `/api/exports/record-shelving.csv?ids=${ids.map(encodeURIComponent).join(",")}`
