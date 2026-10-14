import { Suspense } from "react"

import { RegisterBoxesScreen } from "@/staff/features/boxes/register/register-boxes-screen"

export default function RegisterBoxesPage() {
  return (
    <Suspense>
      <RegisterBoxesScreen />
    </Suspense>
  )
}
