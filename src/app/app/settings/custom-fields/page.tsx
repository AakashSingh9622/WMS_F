import { requirePermission } from "@/auth/session"
import { CustomFieldsScreen } from "@/staff/features/settings/custom-fields-screen"

export default async function CustomFieldsSettingsPage() {
  await requirePermission("settings.manage")
  return <CustomFieldsScreen />
}
