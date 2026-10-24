import { requirePermission } from "@/auth/session"
import { ClientAccountScreen } from "@/staff/features/billing/client-account-screen"

// The client's standing account: invoices in a date range, what's paid, what's still owed (same as Billing → Accounts).
export default async function ClientBillingPage({ params }: PageProps<"/app/clients/[clientId]/billing">) {
  await requirePermission("billing.view")
  const { clientId } = await params
  return <ClientAccountScreen clientId={decodeURIComponent(clientId)} embedded />
}
