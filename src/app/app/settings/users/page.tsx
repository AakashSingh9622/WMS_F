import { requireRole } from "@/auth/session"
import { RouteStub } from "@/components/route-stub"

export default async function UsersSettingsPage() {
  await requireRole("staff_admin")
  return <RouteStub title="Users" />
}
