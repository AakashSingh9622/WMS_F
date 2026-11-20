import { requirePermission } from "@/auth/session"
import { ImportRecordsScreen } from "@/staff/features/boxes/import/import-records-screen"

export default async function ImportRecordsPage() {
  await requirePermission("boxes.operate")
  return <ImportRecordsScreen />
}
