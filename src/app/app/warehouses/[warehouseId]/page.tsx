import { WarehouseOverviewScreen } from "@/staff/features/warehouses/warehouse-overview-screen"

export default async function WarehouseOverviewPage({
  params,
}: PageProps<"/app/warehouses/[warehouseId]">) {
  const { warehouseId } = await params
  return <WarehouseOverviewScreen warehouseId={warehouseId} />
}
