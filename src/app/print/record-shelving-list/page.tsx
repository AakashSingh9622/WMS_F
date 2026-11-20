import { Suspense } from "react"

import { RecordShelvingListDocument } from "@/print/documents/record-shelving-list-document"

export default function RecordShelvingListPrintPage() {
  return (
    <Suspense>
      <RecordShelvingListDocument />
    </Suspense>
  )
}
