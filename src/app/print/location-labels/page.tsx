import { Suspense } from "react"

import { LocationLabelsDocument } from "@/print/documents/location-labels-document"

export default function PrintLocationLabelsPage() {
  return (
    <Suspense>
      <LocationLabelsDocument />
    </Suspense>
  )
}
