import { Suspense } from "react"

import { requirePermission } from "@/auth/session"
import { CreateOrderScreen } from "@/staff/features/orders/create-order-screen"

export default async function CreateOrderPage() {
  await requirePermission("orders.operate")
  return (
    <Suspense>
      <CreateOrderScreen />
    </Suspense>
  )
}
