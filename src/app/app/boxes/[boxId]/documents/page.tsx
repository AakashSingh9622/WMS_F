import { BoxDocumentsTab } from "@/staff/features/boxes/box-documents-tab"

export default async function BoxDocumentsPage({ params }: PageProps<"/app/boxes/[boxId]/documents">) {
  const { boxId } = await params
  return <BoxDocumentsTab boxId={boxId} />
}
