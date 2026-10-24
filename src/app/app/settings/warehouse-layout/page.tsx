import { requirePermission } from "@/auth/session"
import { WarehouseLayoutScreen } from "@/staff/features/settings/warehouse-layout-screen"

export default async function WarehouseLayoutSettingsPage() {
  await requirePermission("layout.manage")
  return <WarehouseLayoutScreen />
}
