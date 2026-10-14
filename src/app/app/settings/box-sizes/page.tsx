import { requireRole } from "@/auth/session"
import { BoxSizesScreen } from "@/staff/features/settings/box-sizes-screen"

export default async function BoxSizesSettingsPage() {
  await requireRole("staff_admin")
  return <BoxSizesScreen />
}
