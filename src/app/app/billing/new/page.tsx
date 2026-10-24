import { requirePermission } from "@/auth/session"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { NewInvoiceScreen } from "@/staff/features/billing/new-invoice-screen"

export default async function NewInvoicePage({ searchParams }: PageProps<"/app/billing/new">) {
  await requirePermission("billing.manage")
  const { clientId, orderId } = await searchParams
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        icon={Invoice}
        title="New invoice"
        description={
          typeof orderId === "string"
            ? "The invoice for an order at its billing stage — type the lines, save, then send it to Sage."
            : "Suggest lines from the warehouse, check the prices, save a draft."
        }
      />
      <NewInvoiceScreen
        clientId={typeof clientId === "string" ? clientId : undefined}
        orderId={typeof orderId === "string" ? orderId : undefined}
      />
    </div>
  )
}
