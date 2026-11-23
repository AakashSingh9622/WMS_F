/**
 * Docbox "Formato": the delivery-note templates an expediente can choose. Keep in step with FORMATS in the backend's
 * expedienteService.js.
 *
 *  - Albaran            the plain list, portrait
 *  - AlbaranApaisado    the same, printed landscape (more columns fit)
 *  - AlbaranCod         adds the internal code (the box barcode) to each line
 *  - AlbaranCodApaisado both of the above
 *  - AlbaranAkte        lines are grouped under the value of the first ordered field (a folder heading per file)
 */
export const DELIVERY_FORMATS = ["Albaran", "AlbaranApaisado", "AlbaranCod", "AlbaranCodApaisado", "AlbaranAkte"] as const
export type DeliveryFormat = (typeof DELIVERY_FORMATS)[number]

export const DELIVERY_FORMAT_LABELS: Record<DeliveryFormat, { name: string; hint: string }> = {
  Albaran: { name: "Albaran", hint: "The plain list, portrait." },
  AlbaranApaisado: { name: "Albaran Apaisado", hint: "The same list, printed landscape." },
  AlbaranCod: { name: "Albaran Cod", hint: "Adds the internal code (box barcode) to each line." },
  AlbaranCodApaisado: { name: "Albaran Cod Apaisado", hint: "Internal code, printed landscape." },
  AlbaranAkte: { name: "Albaran Akte", hint: "Lines grouped under the first field (a heading per folder)." },
}

export const isLandscape = (format: string) => format.endsWith("Apaisado")
export const showsCode = (format: string) => format.startsWith("AlbaranCod")
export const isGrouped = (format: string) => format === "AlbaranAkte"
