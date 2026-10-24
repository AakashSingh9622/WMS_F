import { requirePermission } from "@/auth/session"
import { UsersScreen } from "@/staff/features/settings/users-screen"

export default async function UsersSettingsPage() {
  await requirePermission("users.manage")
  return <UsersScreen />
}
