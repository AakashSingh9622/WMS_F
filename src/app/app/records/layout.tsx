import { requirePermission } from "@/auth/session"
import { TabNav } from "@/components/tab-nav"
import { Shredder } from "@/components/icons"
import { PageHeader } from "@/components/page-header"

export default async function RecordsLayout({ children }: LayoutProps<"/app/records">) {
  await requirePermission("records.manage")
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Shredder}
        title="Records"
        description="Retention, legal holds and certificates of destruction."
        className="shrink-0"
      />
      <TabNav
        items={[
          { href: "/app/records", label: "Due for destruction" },
          { href: "/app/records/holds", label: "Legal holds" },
          { href: "/app/records/rules", label: "Retention rules" },
          { href: "/app/records/certificates", label: "Certificates" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
