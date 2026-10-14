import { ClientOrdersTab } from "@/staff/features/clients/client-orders-tab"

export default async function ClientOrdersPage({ params }: PageProps<"/app/clients/[clientId]/orders">) {
  const { clientId } = await params
  return <ClientOrdersTab clientId={clientId} />
}
