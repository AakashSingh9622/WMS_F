import type { Role } from "@/api/types"

// What each staff role may do. Copy of the backend's src/auth/permissions.js — change both together.
// This copy only decides what the UI shows; the backend enforces it on every request.
// Every staff role can see everything; permissions only cover changing things.

export type Permission =
  | "layout.manage" // create warehouse / rack, change rack cell length, block or resize a slot
  | "settings.manage" // box sizes and other settings
  | "users.manage" // staff users and their roles
  | "audit.read" // global audit log + system changes
  | "boxes.operate" // register, print labels, put away / move, edit details, mark missing
  | "boxes.hold" // place / release a hold
  | "orders.operate" // create, schedule, start, cancel, dispatch, confirm destruction, digitize, complete
  | "orders.approve" // approve / reject requested orders
  | "orders.authorise" // record a client's destruction / digitizing authorisation
  | "billing.view" // see invoices and the Sage settings
  | "billing.manage" // prepare invoices, send them to Sage, change the Sage settings
  | "records.manage" // retention rules and legal holds
  | "records.approve" // the second signature on a destruction (not the person who prepared it)

const ALL: Permission[] = [
  "layout.manage",
  "settings.manage",
  "users.manage",
  "audit.read",
  "boxes.operate",
  "boxes.hold",
  "orders.operate",
  "orders.approve",
  "orders.authorise",
  "billing.view",
  "billing.manage",
  "records.manage",
  "records.approve",
]

const ROLE_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  staff_admin: ALL,
  warehouse_admin: [
    "layout.manage",
    "settings.manage",
    "audit.read",
    "boxes.operate",
    "boxes.hold",
    "orders.operate",
    "orders.approve",
  ],
  operations_manager: ["audit.read", "boxes.operate", "orders.operate", "orders.approve", "orders.authorise"],
  staff_operator: ["boxes.operate", "orders.operate"],
  records_manager: ["audit.read", "boxes.hold", "orders.authorise", "records.manage", "records.approve"],
  finance_manager: ["audit.read", "billing.view", "billing.manage"],
  auditor: ["audit.read", "billing.view"],
}

/** Roles an admin can hand out in Settings → Users. staff_admin only comes from DocuSoft's admin flag. */
export const ASSIGNABLE_ROLES = [
  "warehouse_admin",
  "operations_manager",
  "staff_operator",
  "records_manager",
  "finance_manager",
  "auditor",
] as const satisfies readonly Role[]

export const ROLE_INFO: Partial<Record<Role, { label: string; description: string }>> = {
  staff_admin: { label: "Administrator", description: "DocuSoft admin — can do everything" },
  warehouse_admin: {
    label: "Warehouse admin",
    description: "Warehouse layout, settings, holds, all box and order work, approvals",
  },
  operations_manager: {
    label: "Operations manager",
    description: "All box and order work, approvals, records client authorisations",
  },
  staff_operator: {
    label: "Warehouse operator",
    description: "Registers, stores, moves boxes; works orders (default for every user)",
  },
  records_manager: {
    label: "Records manager",
    description: "Retention rules, legal holds, holds, second signature on destructions, client authorisations",
  },
  finance_manager: { label: "Finance manager", description: "Invoices and Sage, audit log" },
  auditor: { label: "Auditor", description: "Read-only, including the audit log and invoices" },
}

export function roleLabel(role: Role): string {
  return ROLE_INFO[role]?.label ?? role
}

export function can(roles: readonly Role[] | undefined, permission: Permission): boolean {
  return (roles ?? []).some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}
