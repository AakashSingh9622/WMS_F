import { RackDetailScreen } from "@/staff/features/warehouses/rack-detail-screen"

export default async function RackDetailPage({
  params,
}: PageProps<"/app/warehouses/[warehouseId]/racks/[rackId]">) {
  const { warehouseId, rackId } = await params
  return <RackDetailScreen warehouseId={warehouseId} rackId={rackId} />
}
