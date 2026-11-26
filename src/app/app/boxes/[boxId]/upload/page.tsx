import { BoxUploadTab } from "@/staff/features/boxes/box-upload-tab"

export default async function BoxUploadPage({ params }: PageProps<"/app/boxes/[boxId]/upload">) {
  const { boxId } = await params
  return <BoxUploadTab boxId={boxId} />
}
