import { Suspense } from "react"

import { LabelsDocument } from "@/print/documents/labels-document"

export default function PrintLabelsPage() {
  return (
    <Suspense>
      <LabelsDocument />
    </Suspense>
  )
}
