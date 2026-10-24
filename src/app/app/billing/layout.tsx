import { requirePermission } from "@/auth/session"
import { BillingTabs } from "@/staff/features/billing/billing-tabs"

export default async function BillingLayout({ children }: LayoutProps<"/app/billing">) {
  await requirePermission("billing.view")
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <BillingTabs />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
