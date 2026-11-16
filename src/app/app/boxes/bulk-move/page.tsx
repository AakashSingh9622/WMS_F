import { requirePermission } from "@/auth/session"
import { BulkMoveScreen } from "@/staff/features/boxes/import/bulk-move-screen"

export default async function BulkMovePage() {
  await requirePermission("boxes.operate")
  return <BulkMoveScreen />
}
