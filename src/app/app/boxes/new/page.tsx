import { Suspense } from "react"

import { requirePermission } from "@/auth/session"
import { RegisterBoxesScreen } from "@/staff/features/boxes/register/register-boxes-screen"

export default async function RegisterBoxesPage() {
  await requirePermission("boxes.operate")
  return (
    <Suspense>
      <RegisterBoxesScreen />
    </Suspense>
  )
}
