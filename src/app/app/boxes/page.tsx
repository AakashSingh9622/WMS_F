import { Suspense } from "react"

import { FindABoxScreen } from "@/staff/features/boxes/find-a-box-screen"

export default function FindBoxPage() {
  return (
    <Suspense>
      <FindABoxScreen />
    </Suspense>
  )
}
