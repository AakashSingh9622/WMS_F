import { redirect } from "next/navigation"

// No standalone "racks list" page exists — the warehouse overview page already lists every rack
// (see warehouse-overview-screen.tsx). This route only exists so the breadcrumb's "Racks" segment
// (auto-generated from the URL by useBreadcrumbs.ts for /app/warehouses/:id/racks/:rackId) is a
// real, clickable page instead of a 404.
export default async function RacksIndexPage({
  params,
}: PageProps<"/app/warehouses/[warehouseId]/racks">) {
  const { warehouseId } = await params
  redirect(`/app/warehouses/${warehouseId}`)
}
