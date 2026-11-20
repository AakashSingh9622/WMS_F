/**
 * The columns of an "import record requests" sheet (Docbox "IMPORTACION PRESTAMOS"). One row = one record asked for. Rows with the
 * same Type + Urgency + Requested by become one request (split at 100 records). The client sends this sheet; the warehouse uploads it.
 *   Type     physical (the paper is sent: the record goes on loan)  |  digital (a scan: the paper never leaves its box)
 *   Urgency  standard | urgent
 */
export interface RequestImportColumn {
  key: "internalCode" | "file" | "customer" | "type" | "urgency" | "requestedBy"
  header: string
  required?: boolean
  example: string
  /** other names understood when reading a file (matching ignores case, accents, spaces and punctuation) */
  aliases?: string[]
}

export const REQUEST_IMPORT_COLUMNS: RequestImportColumn[] = [
  { key: "internalCode", header: "Internal code", required: true, example: "1000000", aliases: ["codinterno", "code", "recordcode", "codigointerno"] },
  { key: "file", header: "File", example: "", aliases: ["expediente", "fichero"] },
  { key: "customer", header: "Customer", example: "", aliases: ["client", "cliente"] },
  { key: "type", header: "Type", required: true, example: "physical", aliases: ["tipo", "requesttype", "loantype", "tipopeticion"] },
  { key: "urgency", header: "Urgency", required: true, example: "standard", aliases: ["urgencia", "priority", "prioridad"] },
  { key: "requestedBy", header: "Requested by", required: true, example: "contact@client.com", aliases: ["requester", "solicitadopor", "email", "contact", "contactemail"] },
]

export const MAX_REQUEST_IMPORT_ROWS = 500
/** the same limit as the server: one request holds at most this many records */
export const MAX_RECORDS_PER_REQUEST = 100

/** The template as rows of cells: header, one example row (internal code 1000000 is never a real record), then empty rows. */
export function requestTemplateRows(opts: { clientId: string; expedienteCode: string; blankRows: number }): string[][] {
  const fill = (c: RequestImportColumn, example: string) => (c.key === "file" ? opts.expedienteCode : c.key === "customer" ? opts.clientId : example)
  const header = REQUEST_IMPORT_COLUMNS.map((c) => c.header)
  const example = REQUEST_IMPORT_COLUMNS.map((c) => fill(c, c.example))
  const blank = REQUEST_IMPORT_COLUMNS.map((c) => fill(c, ""))
  const n = Math.min(MAX_REQUEST_IMPORT_ROWS, Math.max(0, Math.floor(opts.blankRows) || 0))
  return [header, example, ...Array.from({ length: n }, () => [...blank])]
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

export interface RequestImportRow {
  /** the row's number in the user's file (the header is row 1), so a problem can be pointed at */
  row: number
  internalCode: string
  file: string
  customer: string
  type: string
  urgency: string
  requestedBy: string
}

/**
 * The file as rows of cells -> the rows to send. A row with nothing in it except the File / Customer the template filled in
 * is an unused row and is skipped; every row keeps its own number in the file.
 */
export function parseRequestImportGrid(grid: string[][]): { rows: RequestImportRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = new Map<string, number>()
  for (const col of REQUEST_IMPORT_COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const i = head.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) at.set(col.key, i)
  }
  const missing = REQUEST_IMPORT_COLUMNS.filter((c) => c.required && !at.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }

  const prefilled = new Set([at.get("file"), at.get("customer")])
  const rows: RequestImportRow[] = []
  body.forEach((cells, i) => {
    if (!cells.some((c, col) => (c ?? "").trim() && !prefilled.has(col))) return // an unused template row
    const cell = (key: string) => (cells[at.get(key) ?? -1] ?? "").trim()
    rows.push({
      row: i + 2,
      internalCode: cell("internalCode"),
      file: cell("file"),
      customer: cell("customer"),
      type: cell("type"),
      urgency: cell("urgency"),
      requestedBy: cell("requestedBy"),
    })
  })
  if (rows.length === 0) return { rows: [], problem: "The file has no filled-in rows." }
  if (rows.length > MAX_REQUEST_IMPORT_ROWS) return { rows: [], problem: `At most ${MAX_REQUEST_IMPORT_ROWS} rows per file — split it.` }
  return { rows }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * The contact check, done in the browser against the client's DocuSoft contacts — the same wording the server uses (the server
 * checks again, and also refuses a contact switched off for loans). "Requested by" must be the email of one of them.
 */
export function checkRequestedBy(rows: RequestImportRow[], contactEmails: string[]): { row: number; message: string }[] {
  const known = new Set(contactEmails.map((e) => e.trim().toLowerCase()))
  const errors: { row: number; message: string }[] = []
  for (const r of rows) {
    const who = r.requestedBy.trim().toLowerCase()
    if (!who) errors.push({ row: r.row, message: "Requested by is required (the contact's email)" })
    else if (!EMAIL.test(who)) errors.push({ row: r.row, message: `"${r.requestedBy.trim()}" is not a valid email address` })
    else if (!known.has(who)) errors.push({ row: r.row, message: `${who} is not a contact of this client` })
  }
  return errors
}

/** Both lists of problems as one report: one line per row, every message once, in file order. */
export function mergeRowErrors(...lists: { row: number; message: string }[][]): { row: number; message: string }[] {
  const byRow = new Map<number, string[]>()
  for (const list of lists) {
    for (const e of list) {
      const parts = e.message.split("; ")
      const have = byRow.get(e.row) ?? []
      for (const p of parts) if (!have.includes(p)) have.push(p)
      byRow.set(e.row, have)
    }
  }
  return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([row, parts]) => ({ row, message: parts.join("; ") }))
}
