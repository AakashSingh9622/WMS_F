import { ClientNotesTab } from "@/staff/features/clients/client-notes-tab"

export default async function ClientNotesPage({ params }: PageProps<"/app/clients/[clientId]/notes">) {
  const { clientId } = await params
  return <ClientNotesTab clientId={clientId} />
}
