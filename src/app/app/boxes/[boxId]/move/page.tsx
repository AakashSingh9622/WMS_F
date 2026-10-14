import { MoveBoxScreen } from "@/staff/features/boxes/move-box-screen"

export default async function MoveBoxPage({ params }: PageProps<"/app/boxes/[boxId]/move">) {
  const { boxId } = await params
  return <MoveBoxScreen boxId={boxId} />
}
