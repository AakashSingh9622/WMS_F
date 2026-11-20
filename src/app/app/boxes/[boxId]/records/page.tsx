import { BoxRecordsTab } from "@/staff/features/boxes/box-records-tab"

export default async function BoxRecordsPage({ params }: PageProps<"/app/boxes/[boxId]/records">) {
  const { boxId } = await params
  return <BoxRecordsTab boxId={boxId} />
}
