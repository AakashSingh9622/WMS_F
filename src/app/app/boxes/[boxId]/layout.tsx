import { TabNav } from "@/components/tab-nav"
import { BoxDetailHeader } from "@/staff/features/boxes/box-detail-header"

export default async function BoxDetailLayout({ children, params }: LayoutProps<"/app/boxes/[boxId]">) {
  const { boxId } = await params

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <BoxDetailHeader boxId={boxId} />
      <TabNav
        items={[
          { href: `/app/boxes/${boxId}`, label: "Overview" },
          { href: `/app/boxes/${boxId}/contents`, label: "Contents" },
          { href: `/app/boxes/${boxId}/history`, label: "History" },
          { href: `/app/boxes/${boxId}/orders`, label: "Orders" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
