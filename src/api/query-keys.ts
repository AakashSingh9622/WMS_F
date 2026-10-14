// Consistent query-key factory (spec §6) so mutations can invalidate precisely.
export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  warehouses: {
    all: ["warehouses"] as const,
    detail: (id: string) => ["warehouses", id] as const,
    racks: (id: string) => ["warehouses", id, "racks"] as const,
  },
  racks: {
    detail: (id: string) => ["racks", id] as const,
    slots: (id: string) => ["racks", id, "slots"] as const,
  },
  boxes: {
    search: (params: unknown) => ["boxes", "search", params] as const,
    detail: (id: string) => ["boxes", id] as const,
  },
  clients: {
    all: (q?: string) => ["clients", q ?? ""] as const,
    detail: (id: string) => ["clients", id] as const,
    boxes: (id: string, params: unknown) => ["clients", id, "boxes", params] as const,
    orders: (id: string) => ["clients", id, "orders"] as const,
  },
  orders: {
    search: (params: unknown) => ["orders", "search", params] as const,
    detail: (id: string) => ["orders", id] as const,
    lines: (id: string) => ["orders", id, "lines"] as const,
  },
  audit: {
    search: (params: unknown) => ["audit", "search", params] as const,
  },
  portal: {
    summary: ["portal", "summary"] as const,
    boxes: (params: unknown) => ["portal", "boxes", params] as const,
    box: (id: string) => ["portal", "boxes", id] as const,
    boxHistory: (id: string) => ["portal", "boxes", id, "history"] as const,
    orders: ["portal", "orders"] as const,
    order: (id: string) => ["portal", "orders", id] as const,
  },
}
