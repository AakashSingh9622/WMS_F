import { requirePermission } from "@/auth/session"
import { SitesScreen } from "@/staff/features/settings/sites-screen"

export default async function SitesSettingsPage() {
  await requirePermission("layout.manage")
  return <SitesScreen />
}
