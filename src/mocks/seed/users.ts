import type { Role } from "@/api/types"

export interface SeedUser {
  id: string
  name: string
  email: string
  password: string
  side: "staff" | "client"
  roles: Role[]
  clientId?: string
}

// clientId values line up with seed/clients.ts's COMPANY_NAMES order:
// client-1 = "Acme Legal Partners", client-2 = "Globex Insurance".
export const seedUsers: SeedUser[] = [
  {
    id: "u-admin",
    name: "Ahmed Khan",
    email: "admin@demo.test",
    password: "demo1234",
    side: "staff",
    roles: ["staff_admin"],
  },
  {
    id: "u-operator",
    name: "Sara Ali",
    email: "operator@demo.test",
    password: "demo1234",
    side: "staff",
    roles: ["staff_operator"],
  },
  {
    id: "u-client-admin",
    name: "John Smith",
    email: "client@demo.test",
    password: "demo1234",
    side: "client",
    roles: ["client_admin"],
    clientId: "client-1",
  },
  {
    id: "u-client-viewer",
    name: "Priya Patel",
    email: "viewer@demo.test",
    password: "demo1234",
    side: "client",
    roles: ["client_user"],
    clientId: "client-2",
  },
]
