import { ClientOverviewTab } from "@/staff/features/clients/client-overview-tab"

export default async function ClientOverviewPage({ params }: PageProps<"/app/clients/[clientId]">) {
  const { clientId } = await params
  return <ClientOverviewTab clientId={clientId} />
}
