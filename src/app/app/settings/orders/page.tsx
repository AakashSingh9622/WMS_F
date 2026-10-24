import { requirePermission } from "@/auth/session"
import { RouteStub } from "@/components/route-stub"

export default async function OrdersSettingsPage() {
  await requirePermission("settings.manage")
  return <RouteStub title="Orders settings" />
}
