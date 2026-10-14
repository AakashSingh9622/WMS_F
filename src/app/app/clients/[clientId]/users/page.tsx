import { ClientUsersTab } from "@/staff/features/clients/client-users-tab"

export default async function ClientUsersPage({ params }: PageProps<"/app/clients/[clientId]/users">) {
  const { clientId } = await params
  return <ClientUsersTab clientId={clientId} />
}
