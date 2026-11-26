/**
 * The columns of a "return records by file" sheet (Docbox "Importar Devoluciones"). One row = one record that came back, found by
 * its internal code. File and Customer are optional checks: when filled they must match the record.
 */
export interface RecordReturnColumn {
  key: "internalCode" | "file" | "customer"
  header: string
  required?: boolean
  example: string
  /** other names understood when reading a file (matching ignores case, accents, spaces and punctuation) */
  aliases?: string[]
}

export const RECORD_RETURN_COLUMNS: RecordReturnColumn[] = [
  { key: "internalCode", header: "Internal code", required: true, example: "1000000", aliases: ["codinterno", "code", "recordcode", "codigointerno"] },
  { key: "file", header: "File", example: "", aliases: ["expediente", "fichero"] },
  { key: "customer", header: "Customer", example: "", aliases: ["client", "cliente"] },
]

export const MAX_RECORD_RETURN_ROWS = 500

/** The template as rows of cells: header, one example row (internal code 1000000 is never a real record), then empty rows. */
export function recordReturnTemplateRows(opts: { clientId: string; blankRows: number }): string[][] {
  const fill = (c: RecordReturnColumn, example: string) => (c.key === "customer" ? opts.clientId : example)
  const header = RECORD_RETURN_COLUMNS.map((c) => c.header)
  const example = RECORD_RETURN_COLUMNS.map((c) => fill(c, c.example))
  const blank = RECORD_RETURN_COLUMNS.map((c) => fill(c, ""))
  const n = Math.min(MAX_RECORD_RETURN_ROWS, Math.max(0, Math.floor(opts.blankRows) || 0))
  return [header, example, ...Array.from({ length: n }, () => [...blank])]
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

export interface RecordReturnRow {
  /** the row's number in the user's file (the header is row 1), so a problem can be pointed at */
  row: number
  internalCode: string
  file: string
  customer: string
}

/**
 * The file as rows of cells -> the rows to send. A row with nothing in it except the Customer the template filled in is an unused
 * row and is skipped; every row keeps its own number in the file.
 */
export function parseRecordReturnGrid(grid: string[][]): { rows: RecordReturnRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = new Map<string, number>()
  for (const col of RECORD_RETURN_COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const i = head.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) at.set(col.key, i)
  }
  const missing = RECORD_RETURN_COLUMNS.filter((c) => c.required && !at.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }

  const prefilled = new Set([at.get("customer")])
  const rows: RecordReturnRow[] = []
  body.forEach((cells, i) => {
    if (!cells.some((c, col) => (c ?? "").trim() && !prefilled.has(col))) return // an unused template row
    const cell = (key: string) => (cells[at.get(key) ?? -1] ?? "").trim()
    rows.push({ row: i + 2, internalCode: cell("internalCode"), file: cell("file"), customer: cell("customer") })
  })
  if (rows.length === 0) return { rows: [], problem: "The file has no filled-in rows." }
  if (rows.length > MAX_RECORD_RETURN_ROWS) return { rows: [], problem: `At most ${MAX_RECORD_RETURN_ROWS} rows per file — split it.` }
  return { rows }
}
