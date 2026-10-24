import { requirePermission } from "@/auth/session"
import { BoxSizesScreen } from "@/staff/features/settings/box-sizes-screen"

export default async function BoxSizesSettingsPage() {
  await requirePermission("settings.manage")
  return <BoxSizesScreen />
}
