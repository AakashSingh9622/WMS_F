import { RecordRequestDetailScreen } from "@/staff/features/record-requests/record-request-detail-screen"

export default async function RecordRequestDetailPage({ params }: PageProps<"/app/record-requests/[requestId]">) {
  const { requestId } = await params
  return <RecordRequestDetailScreen requestId={requestId} />
}
