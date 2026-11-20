/**
 * The columns of a "purge records by file" sheet (Docbox "Expurgo"). One row = one record, found by its internal code.
 * `Action` says what happens to it: purge (destroyed for good — Authorised by and Date are then required) or loan (it goes
 * on one record request for the whole file).
 */
export interface RecordPurgeColumn {
  key: "internalCode" | "file" | "customer" | "action" | "authorisedBy" | "date"
  header: string
  required?: boolean
  example: string
  /** other names understood when reading a file (matching ignores case, accents, spaces and punctuation) */
  aliases?: string[]
}

/** The text the template's example row carries. A row that still has it is the example, never a real purge. */
export const EXAMPLE_AUTHORISER = "Name of who authorised it"

export const RECORD_PURGE_COLUMNS: RecordPurgeColumn[] = [
  { key: "internalCode", header: "Internal code", required: true, example: "1000000", aliases: ["codinterno", "code", "recordcode", "codigointerno"] },
  { key: "file", header: "File", example: "", aliases: ["expediente", "fichero"] },
  { key: "customer", header: "Customer", example: "", aliases: ["client", "cliente"] },
  { key: "action", header: "Action", required: true, example: "purge", aliases: ["purgeloan", "tipo", "accion", "purgeorloan"] },
  { key: "authorisedBy", header: "Authorised by", example: EXAMPLE_AUTHORISER, aliases: ["authorizedby", "autorizadopor", "authoriser", "authorizer"] },
  { key: "date", header: "Date", example: "dd/mm/yyyy", aliases: ["fecha", "authoriseddate", "destructiondate"] },
]

export const MAX_RECORD_PURGE_ROWS = 500

/** The template as rows of cells: header, one example row (internal code 1000000 is never a real record), then empty rows. */
export function recordPurgeTemplateRows(opts: { clientId: string; expedienteCode: string; blankRows: number }): string[][] {
  const fill = (c: RecordPurgeColumn, example: string) => (c.key === "file" ? opts.expedienteCode : c.key === "customer" ? opts.clientId : example)
  const header = RECORD_PURGE_COLUMNS.map((c) => c.header)
  const example = RECORD_PURGE_COLUMNS.map((c) => fill(c, c.example))
  const blank = RECORD_PURGE_COLUMNS.map((c) => fill(c, ""))
  const n = Math.min(MAX_RECORD_PURGE_ROWS, Math.max(0, Math.floor(opts.blankRows) || 0))
  return [header, example, ...Array.from({ length: n }, () => [...blank])]
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

export interface RecordPurgeRow {
  /** the row's number in the user's file (the header is row 1), so a problem can be pointed at */
  row: number
  internalCode: string
  file: string
  customer: string
  action: string
  authorisedBy: string
  date: string
}

/**
 * The file as rows of cells -> the rows to send. A row with nothing in it except the File / Customer the template filled in
 * is an unused row and is skipped; every row keeps its own number in the file.
 */
export function parseRecordPurgeGrid(grid: string[][]): { rows: RecordPurgeRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = new Map<string, number>()
  for (const col of RECORD_PURGE_COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const i = head.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) at.set(col.key, i)
  }
  const missing = RECORD_PURGE_COLUMNS.filter((c) => c.required && !at.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }

  const prefilled = new Set([at.get("file"), at.get("customer")])
  const rows: RecordPurgeRow[] = []
  body.forEach((cells, i) => {
    if (!cells.some((c, col) => (c ?? "").trim() && !prefilled.has(col))) return // an unused template row
    const cell = (key: string) => (cells[at.get(key) ?? -1] ?? "").trim()
    rows.push({
      row: i + 2,
      internalCode: cell("internalCode"),
      file: cell("file"),
      customer: cell("customer"),
      action: cell("action"),
      authorisedBy: cell("authorisedBy"),
      date: cell("date"),
    })
  })
  const sample = rows.find((r) => r.authorisedBy.toLowerCase() === EXAMPLE_AUTHORISER.toLowerCase() || r.date.toLowerCase() === "dd/mm/yyyy")
  if (sample) return { rows: [], problem: `Row ${sample.row} still has the template's example text ("${EXAMPLE_AUTHORISER}" / "dd/mm/yyyy"). Delete the example row, or type the real authoriser and date.` }
  if (rows.length === 0) return { rows: [], problem: "The file has no filled-in rows." }
  if (rows.length > MAX_RECORD_PURGE_ROWS) return { rows: [], problem: `At most ${MAX_RECORD_PURGE_ROWS} rows per file — split it.` }
  return { rows }
}

/** The rows' actions as the server will read them (purge / loan), for the summary before anything is sent. */
export const isLoanAction = (action: string) => ["loan", "lend", "prestamo"].includes(norm(action))
export const isPurgeAction = (action: string) => ["purge", "destroy", "destruction", "expurgo"].includes(norm(action))
