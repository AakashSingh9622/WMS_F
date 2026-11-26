/**
 * The columns of a Docbox "records" import file ("Generar Plantillas de Importación"). One row = one record. The client's own
 * fields (FOLDER, SUBFOLDER, CONTENTS …) come first, then these, in Docbox's order. The template and — in the next step —
 * the importer both read this list, so a header can only mean one thing.
 *
 * Box No. says which (already registered) box the record goes into. The location, container and pallet columns describe
 * that box; they are there so a file made in Docbox can be used as it is.
 */
export interface RecordImportColumn {
  key: string
  header: string
  /** what the importer demands */
  required?: boolean
  example: string
  /** other names understood when reading a file (matching ignores case, accents, spaces and punctuation) */
  aliases?: string[]
}

export const RECORD_IMPORT_COLUMNS: RecordImportColumn[] = [
  { key: "floor", header: "Block/Floor", example: "", aliases: ["floor", "block", "planta", "bloqueplanta"] },
  { key: "aisle", header: "Aisle", example: "", aliases: ["corridor", "pasillo"] },
  { key: "module", header: "Shelving unit/Module", example: "", aliases: ["rackmodule", "shelvingunit", "module", "rack", "estanteriamodulo", "estanteria", "modulo"] },
  { key: "shelf", header: "Row/Shelf", example: "", aliases: ["rowshelf", "shelf", "row", "fila", "filabalda", "balda"] },
  { key: "palletNo", header: "Pallet No.", example: "", aliases: ["palletnumber", "npalet", "palet"] },
  { key: "site", header: "Site", example: "", aliases: ["sede", "headoffice"] },
  { key: "warehouse", header: "Warehouse", example: "", aliases: ["almacen"] },
  { key: "containerNo", header: "NCE", example: "", aliases: ["containernumber", "ncontenedor", "contenedor", "container"] },
  { key: "containerType", header: "TYPECE", example: "", aliases: ["containertype", "tipocontenedor", "tipoce"] },
  { key: "boxNo", header: "Box No.", required: true, example: "BX00000000", aliases: ["boxnumber", "numbox", "ncaja", "caja", "box"] },
  { key: "boxType", header: "Box Type", example: "", aliases: ["size", "tipocaja"] },
  { key: "file", header: "File", example: "", aliases: ["expediente", "fichero"] },
  { key: "customer", header: "Customer", example: "", aliases: ["client", "cliente"] },
  { key: "comments", header: "Comments", example: "", aliases: ["observaciones", "observations", "remarks", "notes"] },
]

export const MAX_RECORD_IMPORT_ROWS = 500

/** The template as rows of cells: header, one example row, then `blankRows` empty rows with File and Customer filled in. */
export function recordTemplateRows(opts: {
  fields: { name: string; fieldType: "text" | "date" | "number" }[]
  clientId: string
  expedienteCode: string
  blankRows: number
}): string[][] {
  const header = [...opts.fields.map((f) => f.name), ...RECORD_IMPORT_COLUMNS.map((c) => c.header)]
  const fill = (key: string, example: string) => (key === "file" ? opts.expedienteCode : key === "customer" ? opts.clientId : example)
  const example = [
    ...opts.fields.map((f) => (f.fieldType === "date" ? "2026-01-01" : f.fieldType === "number" ? "1" : "")),
    ...RECORD_IMPORT_COLUMNS.map((c) => fill(c.key, c.example)),
  ]
  const blank = [...opts.fields.map(() => ""), ...RECORD_IMPORT_COLUMNS.map((c) => fill(c.key, ""))]
  const n = Math.min(MAX_RECORD_IMPORT_ROWS, Math.max(0, Math.floor(opts.blankRows) || 0))
  return [header, example, ...Array.from({ length: n }, () => [...blank])]
}

// Matching ignores case, accents, spaces and punctuation.
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

export interface RecordImportRow {
  /** the row's number in the user's file (the header is row 1), so a problem can be pointed at */
  row: number
  boxNo: string
  file: string
  customer: string
  comments: string
  /** the client's own fields by code */
  customFields: Record<string, string>
}

/**
 * The file as rows of cells -> the rows to send. A row with nothing in it except the File / Customer the template filled in
 * is an unused row and is skipped; every row keeps its own number in the file.
 */
export function parseRecordImportGrid(
  grid: string[][],
  fields: { code: string; name: string; required: boolean }[],
): { rows: RecordImportRow[]; problem?: string } {
  const [head, ...body] = grid
  if (!head) return { rows: [], problem: "The file is empty." }
  const at = new Map<string, number>()
  for (const col of RECORD_IMPORT_COLUMNS) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm)
    const i = head.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) at.set(col.key, i)
  }
  const customAt = new Map<string, number>()
  for (const f of fields) {
    const i = head.findIndex((h) => norm(h) === norm(f.name) || norm(h) === norm(f.code))
    if (i >= 0) customAt.set(f.code, i)
  }
  const missingCustom = fields.filter((f) => f.required && !customAt.has(f.code)).map((f) => f.name)
  if (missingCustom.length) {
    return { rows: [], problem: `Missing column${missingCustom.length > 1 ? "s" : ""}: ${missingCustom.join(", ")}. Download the template again.` }
  }
  const missing = RECORD_IMPORT_COLUMNS.filter((c) => c.required && !at.has(c.key)).map((c) => c.header)
  if (missing.length) return { rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template.` }

  const prefilled = new Set([at.get("file"), at.get("customer")])
  const rows: RecordImportRow[] = []
  body.forEach((cells, i) => {
    if (!cells.some((c, col) => (c ?? "").trim() && !prefilled.has(col))) return // an unused template row
    const cell = (key: string) => (cells[at.get(key) ?? -1] ?? "").trim()
    const customFields: Record<string, string> = {}
    for (const [code, col] of customAt) customFields[code] = (cells[col] ?? "").trim()
    rows.push({ row: i + 2, boxNo: cell("boxNo"), file: cell("file"), customer: cell("customer"), comments: cell("comments"), customFields })
  })
  if (rows.length === 0) return { rows: [], problem: "The file has no filled-in rows." }
  if (rows.length > MAX_RECORD_IMPORT_ROWS) return { rows: [], problem: `At most ${MAX_RECORD_IMPORT_ROWS} rows per file — split it.` }
  return { rows }
}
