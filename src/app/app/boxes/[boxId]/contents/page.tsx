import { BoxContentsTab } from "@/staff/features/boxes/box-contents-tab"

export default async function BoxContentsPage({ params }: PageProps<"/app/boxes/[boxId]/contents">) {
  const { boxId } = await params
  return <BoxContentsTab boxId={boxId} />
}
