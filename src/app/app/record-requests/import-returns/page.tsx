import { requirePermission } from "@/auth/session"
import { ImportReturnsScreen } from "@/staff/features/record-requests/import-returns-screen"

export default async function ImportReturnsPage() {
  await requirePermission("boxes.operate")
  return <ImportReturnsScreen />
}
