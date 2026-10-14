import { Suspense } from "react"

import { CreateOrderScreen } from "@/staff/features/orders/create-order-screen"

export default function CreateOrderPage() {
  return (
    <Suspense>
      <CreateOrderScreen />
    </Suspense>
  )
}
