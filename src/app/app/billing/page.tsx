import { requirePermission } from "@/auth/session"
import { InvoicesListScreen } from "@/staff/features/billing/invoices-list-screen"

export default async function InvoicesPage() {
  await requirePermission("billing.view")
  return <InvoicesListScreen />
}
