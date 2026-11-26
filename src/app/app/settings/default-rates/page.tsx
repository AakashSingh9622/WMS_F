import { requirePermission } from "@/auth/session"
import { DefaultRateListScreen } from "@/staff/features/billing/rate-cards-screen"

export default async function DefaultRateListPage() {
  await requirePermission("billing.view")
  return <DefaultRateListScreen />
}
