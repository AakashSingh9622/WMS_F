import { DestructionCertificateDocument } from "@/print/documents/destruction-certificate-document"

export default async function DestructionCertificatePrintPage({
  params,
}: PageProps<"/print/destruction-certificate/[orderId]">) {
  const { orderId } = await params
  return <DestructionCertificateDocument orderId={orderId} />
}
