import { WitnessSlipDocument } from "@/print/documents/witness-slip-document"

export default async function WitnessSlipPrintPage({ params }: PageProps<"/print/witness-slip/[orderId]">) {
  const { orderId } = await params
  return <WitnessSlipDocument orderId={orderId} />
}
