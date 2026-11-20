import { requirePermission } from "@/auth/session"
import { MoveRecordsScreen } from "@/staff/features/boxes/import/move-records-screen"

export default async function MoveRecordsPage() {
  await requirePermission("boxes.operate")
  return <MoveRecordsScreen />
}
