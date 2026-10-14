import { RouteStub } from "@/components/route-stub"

export default async function DeliveryNotePrintPage({
  params,
}: PageProps<"/print/delivery-note/[orderId]">) {
  const { orderId } = await params
  return <RouteStub title={`Delivery note — ${orderId}`} />
}
