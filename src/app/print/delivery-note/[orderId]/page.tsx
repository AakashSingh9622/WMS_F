import { DeliveryNoteDocument } from "@/print/documents/delivery-note-document"

export default async function DeliveryNotePrintPage({ params }: PageProps<"/print/delivery-note/[orderId]">) {
  const { orderId } = await params
  return <DeliveryNoteDocument orderId={orderId} />
}
