import { requireRole } from "@/auth/session"
import { RouteStub } from "@/components/route-stub"

export default async function OrdersSettingsPage() {
  await requireRole("staff_admin")
  return <RouteStub title="Orders settings" />
}
