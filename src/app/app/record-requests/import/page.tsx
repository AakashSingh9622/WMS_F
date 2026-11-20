import { requirePermission } from "@/auth/session"
import { ImportRequestsScreen } from "@/staff/features/record-requests/import-requests-screen"

export default async function ImportRequestsPage() {
  await requirePermission("boxes.operate")
  return <ImportRequestsScreen />
}
