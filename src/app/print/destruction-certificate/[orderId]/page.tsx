import { RouteStub } from "@/components/route-stub"

export default async function DestructionCertificatePrintPage({
  params,
}: PageProps<"/print/destruction-certificate/[orderId]">) {
  const { orderId } = await params
  return <RouteStub title={`Certificate of destruction — ${orderId}`} />
}
