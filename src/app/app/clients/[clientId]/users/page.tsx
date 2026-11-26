import { redirect } from "next/navigation"

// The tab was renamed "Contacts" — old links / bookmarks to …/users land there.
export default async function ClientUsersRedirect({ params }: PageProps<"/app/clients/[clientId]/users">) {
  const { clientId } = await params
  redirect(`/app/clients/${encodeURIComponent(clientId)}/contacts`)
}
