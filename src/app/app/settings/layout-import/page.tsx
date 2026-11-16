import { requirePermission } from "@/auth/session"
import { LayoutImportScreen } from "@/staff/features/settings/layout-import-screen"

export default async function LayoutImportSettingsPage() {
  await requirePermission("layout.manage")
  return <LayoutImportScreen />
}
