import { RecordDeliveryNoteDocument } from "@/print/documents/record-delivery-note-document"

export default async function RecordDeliveryNotePrintPage({ params }: PageProps<"/print/record-delivery-note/[requestId]">) {
  const { requestId } = await params
  return <RecordDeliveryNoteDocument requestId={requestId} />
}
