/**
 * The columns of a "move records to another box" sheet (Docbox "Cambio de ubicación" for records). One row = one record,
 * found by its internal code, and the box it goes to. A record has no shelf of its own: its place is its box's place.
 */
export interface RecordMoveColumn {
  key: "internalCode" | "file" | "customer" | "newBox"
  header: string
  required?: boolean
  example: string
  /** other names understood when reading a file (matching ignores case, accents, spaces and punctuation) */
  aliases?: string[]
}

export const RECORD_MOVE_COLUMNS: RecordMoveColumn[] = [
  { key: "internalCode", header: "Internal code", required: true, example: "1000000", aliases: ["codinterno", "code", "recordcode", "codigointerno"] },
  { key: "file", header: "File", example: "", aliases: ["expediente", "fichero"] },
  { key: "customer", header: "Customer", example: "", aliases: ["client", "cliente"] },
  { key: "newBox", header: "New box no.", required: true, example: "BX00000000", aliases: ["newbox", "destinationbox", "tobox", "boxnumber", "boxno", "caja", "cajadestino", "numbox"] },
]

export const MAX_RECORD_MOVE_ROWS = 500

/** The template as rows of cells: header, one example row (internal code 1000000 is never a real record), then empty rows. */
export function recordMoveTemplateRows(opts: { clientId: string; expedienteCode: string; blankRows: number }): string[][] {
  const fill = (c: RecordMoveColumn, example: string) => (c.key === "file" ? opts.expedienteCode : c.key === "customer" ? opts.clientId : example)
  const header = RECORD_MOVE_COLUMNS.map((c) => c.header)
  const example = RECORD_MOVE_COLUMNS.map((c) => fill(c, c.example))
  const blank = RECORD_MOVE_COLUMNS.map((c) => fill(c, ""))
  const n = Math.min(MAX_RECORD_MOVE_ROWS, Math.max(0, Math.floor(opts.blankRows) || 0))
  return [header, example, ...Array.from({ length: n }, () => [...blank])]
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

export interface RecordMoveRow {
  /** the row's number in the user's file (the header is row 1), so a problem can be pointed at */
  row: number
  internalCode: string
  file: string
  customer: string
  newBox: string
}

/**
 * The file as rows of cells -> the rows to send. A row with nothing in it except the File / Customer the template filled in
 * is an unused row and is skipped; every row keeps its own number in the file.
 */
export function parseRecordMoveGrid(grid: string[][]): { rows: RecordMoveRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = new Map<string, number>()
  for (const col of RECORD_MOVE_COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const i = head.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) at.set(col.key, i)
  }
  const missing = RECORD_MOVE_COLUMNS.filter((c) => c.required && !at.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }

  const prefilled = new Set([at.get("file"), at.get("customer")])
  const rows: RecordMoveRow[] = []
  body.forEach((cells, i) => {
    if (!cells.some((c, col) => (c ?? "").trim() && !prefilled.has(col))) return // an unused template row
    const cell = (key: string) => (cells[at.get(key) ?? -1] ?? "").trim()
    rows.push({ row: i + 2, internalCode: cell("internalCode"), file: cell("file"), customer: cell("customer"), newBox: cell("newBox") })
  })
  if (rows.length === 0) return { rows: [], problem: "The file has no filled-in rows." }
  if (rows.length > MAX_RECORD_MOVE_ROWS) return { rows: [], problem: `At most ${MAX_RECORD_MOVE_ROWS} rows per file — split it.` }
  return { rows }
}
