import { PortalOrderDetailScreen } from "@/portal/features/orders/portal-order-detail-screen"

export default async function PortalOrderDetailPage({ params }: PageProps<"/portal/orders/[orderId]">) {
  const { orderId } = await params
  return <PortalOrderDetailScreen orderId={orderId} />
}
