import { requirePermission } from "@/auth/session"
import { ExceptionsScreen } from "@/staff/features/scanning/exceptions-screen"

export default async function ExceptionsPage() {
  await requirePermission("orders.approve")
  return <ExceptionsScreen />
}
