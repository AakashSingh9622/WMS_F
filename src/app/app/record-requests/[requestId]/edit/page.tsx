import { requirePermission } from "@/auth/session"
import { EditRecordRequestScreen } from "@/staff/features/record-requests/edit-record-request-screen"

export default async function EditRecordRequestPage({ params }: PageProps<"/app/record-requests/[requestId]/edit">) {
  await requirePermission("boxes.operate")
  const { requestId } = await params
  return <EditRecordRequestScreen requestId={requestId} />
}
