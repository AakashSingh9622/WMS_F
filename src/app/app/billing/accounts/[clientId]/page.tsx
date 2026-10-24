import { ClientAccountScreen } from "@/staff/features/billing/client-account-screen"

export default async function ClientAccountPage({ params }: PageProps<"/app/billing/accounts/[clientId]">) {
  const { clientId } = await params
  return <ClientAccountScreen clientId={decodeURIComponent(clientId)} />
}
