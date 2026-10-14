import { BoxOrdersTab } from "@/staff/features/boxes/box-orders-tab"

export default async function BoxOrdersPage({ params }: PageProps<"/app/boxes/[boxId]/orders">) {
  const { boxId } = await params
  return <BoxOrdersTab boxId={boxId} />
}
