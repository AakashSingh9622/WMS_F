/**
 * Small CSV reader for spreadsheet imports. Handles quoted cells, "" escapes, line breaks inside quotes, a UTF-8 BOM,
 * and either comma or semicolon separators (Excel in Spain / most of Europe saves ";"). Returns rows of cells.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "")
  // Separator: whichever of , ; appears more in the header line.
  const header = text.split(/\r?\n/, 1)[0] ?? ""
  const sep = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ","

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // Drop fully empty lines (Excel leaves them at the end).
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

/** One CSV cell, quoted, with spreadsheet formulas defused. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/** Browser download of a CSV built in memory. */
export function downloadCsv(filename: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
