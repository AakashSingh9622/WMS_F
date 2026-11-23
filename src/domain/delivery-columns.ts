import type { Box } from "@/api/types"
import type { CustomField } from "@/api/customFields"

/**
 * What a client's delivery note can list for each box, besides the box number (Docbox "Formato" and
 * "Ordenación C1,C2,C3"). Custom field codes (C1, C2 …) are allowed on top of these. Keep in step with the backend's
 * DELIVERY_COLUMNS in clientProfileService.js.
 */
export const DELIVERY_COLUMN_KEYS = ["description", "department", "reference", "filingDates", "retention", "size", "pallet"] as const
export type DeliveryColumnKey = (typeof DELIVERY_COLUMN_KEYS)[number]

export const DELIVERY_COLUMN_LABELS: Record<DeliveryColumnKey, string> = {
  description: "Description",
  department: "Department",
  reference: "Reference",
  filingDates: "Filing dates",
  retention: "Retention category",
  size: "Box size",
  pallet: "Pallet number",
}

/** What a delivery note shows when the client has no choice saved. */
export const DEFAULT_DELIVERY_COLUMNS: string[] = ["description"]

export function deliveryColumnLabel(key: string, fields: CustomField[]): string {
  return (DELIVERY_COLUMN_LABELS as Record<string, string>)[key] ?? fields.find((f) => f.code === key)?.name ?? key
}

/** The text of one cell: a built-in column or one of the client's own fields. Dates keep ISO form here; callers format. */
export function deliveryCell(box: Box, key: string, sizeName: (code: string) => string): string {
  switch (key) {
    case "description":
      return box.description
    case "department":
      return box.department ?? ""
    case "reference":
      return box.reference ?? ""
    case "filingDates":
      return [box.filingDateFrom, box.filingDateTo].filter(Boolean).join(" – ")
    case "retention":
      return box.retentionCategory ?? ""
    case "size":
      return sizeName(box.size)
    case "pallet":
      return box.palletNo ?? ""
    default:
      return String(box.customFields?.[key] ?? "")
  }
}
