import { requireRole } from "@/auth/session"
import { WarehouseLayoutScreen } from "@/staff/features/settings/warehouse-layout-screen"

export default async function WarehouseLayoutSettingsPage() {
  await requireRole("staff_admin")
  return <WarehouseLayoutScreen />
}
