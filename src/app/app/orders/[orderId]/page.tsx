import { OrderDetailScreen } from "@/staff/features/orders/order-detail-screen"

export default async function OrderDetailPage({ params }: PageProps<"/app/orders/[orderId]">) {
  const { orderId } = await params
  return <OrderDetailScreen orderId={orderId} />
}
