import { BoxHistoryTab } from "@/staff/features/boxes/box-history-tab"

export default async function BoxHistoryPage({ params }: PageProps<"/app/boxes/[boxId]/history">) {
  const { boxId } = await params
  return <BoxHistoryTab boxId={boxId} />
}
