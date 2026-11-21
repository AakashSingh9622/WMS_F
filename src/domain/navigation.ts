import type { Permission } from "@/domain/permissions"

export interface NavItem {
  href: string
  label: string
  /** When set, only users with this permission see the item. Guards still enforce access server-side. */
  permission?: Permission
}

export const staffNavItems: NavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/boxes", label: "Find a box" },
  { href: "/app/orders", label: "Orders" },
  { href: "/app/record-requests", label: "Record requests", permission: "boxes.operate" },
  { href: "/app/warehouses", label: "Warehouses" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/exceptions", label: "Exceptions", permission: "orders.approve" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/records", label: "Records", permission: "records.manage" },
  { href: "/app/billing", label: "Billing", permission: "billing.view" },
  { href: "/app/audit", label: "Audit log", permission: "audit.read" },
  { href: "/app/settings", label: "Settings" },
]

export const portalNavItems: NavItem[] = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/inventory", label: "My boxes" },
  { href: "/portal/orders", label: "My orders" },
  { href: "/portal/settings", label: "Settings" },
]

// No useMatches()/handle equivalent in the App Router, so breadcrumbs are
// built from a static path -> label lookup instead (see useBreadcrumbs).
export const routeLabels: Record<string, string> = {
  app: "Staff",
  portal: "Portal",
  boxes: "Boxes",
  new: "New",
  move: "Move",
  history: "History",
  orders: "Orders",
  pick: "Pick",
  receive: "Receive",
  warehouses: "Warehouses",
  racks: "Modules",
  clients: "Clients",
  activity: "Activity",
  users: "Users",
  audit: "Audit log",
  billing: "Billing",
  charges: "Charges",
  runs: "Billing runs",
  "rate-cards": "Rate cards",
  accounts: "Accounts",
  records: "Records",
  holds: "Legal holds",
  rules: "Retention rules",
  certificates: "Certificates",
  contents: "Contents",
  exports: "Exports",
  "put-away": "Put away",
  exceptions: "Exceptions",
  sage: "Sage",
  settings: "Settings",
  profile: "Profile",
  signature: "My signature",
  "warehouse-layout": "Warehouse layout",
  "layout-import": "Warehouse layout",
  sites: "Sites",
  labels: "Labels",
  inventory: "Inventory",
  "import-records": "Import records",
  "move-records": "Move records",
  "record-requests": "Record requests",
  returns: "Return records",
  "import-returns": "Import returns",
  edit: "Edit",
  "purge-by-file": "Purge by file",
  "purge-approvals": "Purge approvals",
}
