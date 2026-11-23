/** How a client asked for an order (Docbox "Tipo Petición"). */
export type RequestChannel = "email" | "phone" | "in_person" | "post" | "fax"

export const REQUEST_CHANNELS: { value: RequestChannel; label: string }[] = [
  { value: "email", label: "By email" },
  { value: "phone", label: "By phone" },
  { value: "in_person", label: "In person" },
  { value: "post", label: "By certified post" },
  { value: "fax", label: "By fax" },
]

export const requestChannelLabel = (value?: string) => REQUEST_CHANNELS.find((c) => c.value === value)?.label
