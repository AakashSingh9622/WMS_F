import { RecordWitnessSlipsDocument } from "@/print/documents/record-witness-slips-document"

export default async function RecordWitnessSlipsPrintPage({ params }: PageProps<"/print/record-witness-slips/[requestId]">) {
  const { requestId } = await params
  return <RecordWitnessSlipsDocument requestId={requestId} />
}
