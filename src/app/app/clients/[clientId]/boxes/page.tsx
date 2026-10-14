import { ClientBoxesTab } from "@/staff/features/clients/client-boxes-tab"

export default async function ClientBoxesPage({ params }: PageProps<"/app/clients/[clientId]/boxes">) {
  const { clientId } = await params
  return <ClientBoxesTab clientId={clientId} />
}
