import { requirePermission } from "@/auth/session"
import { ReturnRecordsScreen } from "@/staff/features/record-requests/return-records-screen"

export default async function ReturnRecordsPage() {
  await requirePermission("boxes.operate")
  return <ReturnRecordsScreen />
}
