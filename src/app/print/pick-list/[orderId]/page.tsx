import { RouteStub } from "@/components/route-stub"

export default async function PickListPrintPage({
  params,
}: PageProps<"/print/pick-list/[orderId]">) {
  const { orderId } = await params
  return <RouteStub title={`Pick list — ${orderId}`} />
}
