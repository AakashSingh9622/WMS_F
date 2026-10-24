import { requirePermission } from "@/auth/session"
import { SageSettingsScreen } from "@/staff/features/billing/sage-settings-screen"

export default async function SageSettingsPage() {
  await requirePermission("billing.view")
  return <SageSettingsScreen />
}
