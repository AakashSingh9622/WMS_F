import { requirePermission } from "@/auth/session"
import { InvoiceDetailScreen } from "@/staff/features/billing/invoice-detail-screen"

export default async function InvoicePage({ params }: PageProps<"/app/billing/[invoiceId]">) {
  await requirePermission("billing.view")
  const { invoiceId } = await params
  return <InvoiceDetailScreen invoiceId={invoiceId} />
}
