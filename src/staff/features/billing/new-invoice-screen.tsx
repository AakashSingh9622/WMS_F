"use client"

import Link from "next/link"

import { useOrder } from "@/api/orders"
import { Skeleton } from "@/components/ui/skeleton"
import { InvoiceForm } from "@/staff/features/billing/invoice-form"

/** New invoice — for a client and period, or (orderId) for one order at its billing stage. */
export function NewInvoiceScreen({ clientId, orderId }: { clientId?: string; orderId?: string }) {
  const { data: order, isLoading } = useOrder(orderId ?? "")
  if (!orderId) return <InvoiceForm initialClientId={clientId} />
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!order) return <p className="text-muted-foreground text-sm">Order not found.</p>
  if (order.status !== "billing" || (order.billing && order.billing.status !== "awaiting_invoice")) {
    return (
      <p className="text-muted-foreground text-sm">
        {order.orderNumber} doesn&apos;t need a new invoice
        {order.billing?.invoiceId ? (
          <>
            {" "}
            — it already has{" "}
            <Link href={`/app/billing/${order.billing.invoiceId}`} className="text-primary hover:underline">
              {order.billing.invoiceNumber}
            </Link>
          </>
        ) : null}
        .
      </p>
    )
  }
  return <InvoiceForm order={order} />
}
