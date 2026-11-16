import { requirePermission } from "@/auth/session"
import { ImportBoxesScreen } from "@/staff/features/boxes/import/import-boxes-screen"

export default async function ImportBoxesPage() {
  await requirePermission("boxes.operate")
  return <ImportBoxesScreen />
}
