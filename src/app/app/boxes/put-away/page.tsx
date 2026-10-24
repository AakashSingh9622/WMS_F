import { requirePermission } from "@/auth/session"
import { PutAwayScreen } from "@/staff/features/scanning/put-away-screen"

export default async function PutAwayPage() {
  await requirePermission("boxes.operate")
  return <PutAwayScreen />
}
