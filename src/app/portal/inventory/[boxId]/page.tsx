import { PortalBoxDetailScreen } from "@/portal/features/inventory/portal-box-detail-screen"

export default async function PortalBoxDetailPage({ params }: PageProps<"/portal/inventory/[boxId]">) {
  const { boxId } = await params
  return <PortalBoxDetailScreen boxId={boxId} />
}
