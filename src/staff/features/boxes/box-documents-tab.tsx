"use client"

import { useBox } from "@/api/boxes"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxDocuments } from "@/staff/features/orders/order-documents"

/** "Document list" tab: the documents DocuSoft holds against this box's number. */
export function BoxDocumentsTab({ boxId }: { boxId: string }) {
  const { data: box, isLoading } = useBox(boxId)
  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!box) return null
  return <BoxDocuments boxNumber={box.boxNumber} />
}
