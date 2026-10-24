import { requirePermission } from "@/auth/session"
import { PickScreen } from "@/staff/features/scanning/pick-screen"

export default async function PickPage({ params }: PageProps<"/app/orders/[orderId]/pick">) {
  await requirePermission("orders.operate")
  const { orderId } = await params
  return <PickScreen orderId={orderId} />
}
