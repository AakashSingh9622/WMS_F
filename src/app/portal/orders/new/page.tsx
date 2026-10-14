import { Suspense } from "react"

import { RequestOrderScreen } from "@/portal/features/orders/request-order-screen"

export default function PortalRequestOrderPage() {
  return (
    <Suspense>
      <RequestOrderScreen />
    </Suspense>
  )
}
