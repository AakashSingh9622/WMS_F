import { TabNav } from "@/components/tab-nav"
import { getSession } from "@/auth/session"
import { can } from "@/domain/permissions"
import { ClientDetailHeader } from "@/staff/features/clients/client-detail-header"

export default async function ClientDetailLayout({ children, params }: LayoutProps<"/app/clients/[clientId]">) {
  const { clientId } = await params
  const session = await getSession()
  const seesBilling = can(session?.roles, "billing.view") // the tab only for people who may see invoices

  return (
    // Header + tabs stay fixed; only the tab content (e.g. a table body) scrolls.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ClientDetailHeader clientId={clientId} />
      <TabNav
        items={[
          { href: `/app/clients/${clientId}`, label: "Overview" },
          { href: `/app/clients/${clientId}/boxes`, label: "Boxes" },
          { href: `/app/clients/${clientId}/orders`, label: "Orders" },
          ...(seesBilling ? [{ href: `/app/clients/${clientId}/billing`, label: "Billing" }] : []),
          { href: `/app/clients/${clientId}/activity`, label: "Activity" },
          { href: `/app/clients/${clientId}/users`, label: "Users" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
