import { BillingRunDetailScreen } from "@/staff/features/billing/billing-run-detail-screen"

export default async function BillingRunPage({ params }: PageProps<"/app/billing/runs/[runId]">) {
  const { runId } = await params
  return <BillingRunDetailScreen runId={runId} />
}
