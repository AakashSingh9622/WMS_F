import { requirePermission } from "@/auth/session"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { InvoiceForm } from "@/staff/features/billing/invoice-form"

export default async function NewInvoicePage({ searchParams }: PageProps<"/app/billing/new">) {
  await requirePermission("billing.manage")
  const { clientId } = await searchParams
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        icon={Invoice}
        title="New invoice"
        description="Suggest lines from the warehouse, check the prices, save a draft."
      />
      <InvoiceForm initialClientId={typeof clientId === "string" ? clientId : undefined} />
    </div>
  )
}
