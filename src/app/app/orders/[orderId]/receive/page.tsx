import { requirePermission } from "@/auth/session"
import { ReceiveScreen } from "@/staff/features/scanning/receive-screen"

export default async function ReceivePage({ params }: PageProps<"/app/orders/[orderId]/receive">) {
  await requirePermission("orders.operate")
  const { orderId } = await params
  return <ReceiveScreen orderId={orderId} />
}
