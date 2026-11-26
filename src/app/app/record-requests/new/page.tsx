import { requirePermission } from "@/auth/session"
import { RequestRecordsScreen } from "@/staff/features/record-requests/request-records-screen"

export default async function RecordRequestsPage() {
  await requirePermission("boxes.operate")
  return <RequestRecordsScreen />
}
