import { ClientUsersTab } from "@/staff/features/clients/client-users-tab"

export default async function ClientContactsPage({ params }: PageProps<"/app/clients/[clientId]/contacts">) {
  const { clientId } = await params
  return <ClientUsersTab clientId={clientId} />
}
