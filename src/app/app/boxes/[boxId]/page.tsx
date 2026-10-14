import { BoxOverviewTab } from "@/staff/features/boxes/box-overview-tab"

export default async function BoxOverviewPage({ params }: PageProps<"/app/boxes/[boxId]">) {
  const { boxId } = await params
  return <BoxOverviewTab boxId={boxId} />
}
