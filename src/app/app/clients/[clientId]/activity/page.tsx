import { ClientActivityTab } from "@/staff/features/clients/client-activity-tab"

export default async function ClientActivityPage({ params }: PageProps<"/app/clients/[clientId]/activity">) {
  const { clientId } = await params
  return <ClientActivityTab clientId={clientId} />
}
