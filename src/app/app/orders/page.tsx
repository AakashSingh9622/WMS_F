import { Suspense } from "react"

import { OrdersListScreen } from "@/staff/features/orders/orders-list-screen"

export default function OrdersListPage() {
  return (
    <Suspense>
      <OrdersListScreen />
    </Suspense>
  )
}
