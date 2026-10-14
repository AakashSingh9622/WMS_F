"use client"

import { formatDate } from "@/lib/formatting"
import Link from "next/link"
import { notFound } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useAuthorisePortalDestruction, useCancelPortalOrder, usePortalOrder } from "@/api/portal"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { StatusStepper } from "@/components/status-stepper"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"

const PRINT_DOCS: Record<string, { label: string; href: (id: string) => string }> = {
  dispatch: { label: "Delivery note", href: (id) => `/print/delivery-note/${id}` },
  destruction: { label: "Certificate of destruction", href: (id) => `/print/destruction-certificate/${id}` },
}

export function PortalOrderDetailScreen({ orderId }: { orderId: string }) {
  const { data: order, isLoading, isError } = usePortalOrder(orderId)
  const cancelOrder = useCancelPortalOrder()
  const authoriseDestruction = useAuthorisePortalDestruction()
  const [authorised, setAuthorised] = useState(false)
  const [authName, setAuthName] = useState("")

  if (isError) notFound()
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!order) return null

  const printDoc = PRINT_DOCS[order.type]
  const needsAuthorisation = order.type === "destruction" && !order.destruction

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
          <OrderTypeLabel type={order.type} />
        </div>
        <StatusStepper status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Boxes</span> {order.boxCount}
          </p>
          {order.scheduledFor && (
            <p>
              <span className="text-muted-foreground">Scheduled for</span> {formatDate(order.scheduledFor)}
            </p>
          )}
          {order.completedAt && (
            <p>
              <span className="text-muted-foreground">Completed</span> {formatDate(order.completedAt)}
            </p>
          )}
        </CardContent>
      </Card>

      {needsAuthorisation && (
        <Card className="border-status-pending-destruction/40">
          <CardHeader>
            <CardTitle className="text-sm">Authorisation needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={authorised} onCheckedChange={(v) => setAuthorised(!!v)} className="mt-0.5" />
              I authorise the destruction of these {order.boxCount} boxes.
            </label>
            <Field>
              <FieldLabel htmlFor="portal-auth-name">Type your full name to confirm</FieldLabel>
              <Input id="portal-auth-name" value={authName} onChange={(e) => setAuthName(e.target.value)} />
            </Field>
            <Button
              size="sm"
              disabled={!authorised || !authName || authoriseDestruction.isPending}
              onClick={() =>
                authoriseDestruction.mutate(
                  { orderId: order.id, name: authName },
                  {
                    onSuccess: () => toast.success("Authorisation recorded"),
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't record that"),
                  },
                )
              }
            >
              {authoriseDestruction.isPending ? "Saving…" : "Authorise"}
            </Button>
          </CardContent>
        </Card>
      )}

      {order.status === "requested" && (
        <Button
          variant="outline"
          disabled={cancelOrder.isPending}
          onClick={() =>
            cancelOrder.mutate(order.id, {
              onSuccess: () => toast.success("Order cancelled"),
              onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't cancel that"),
            })
          }
        >
          {cancelOrder.isPending ? "Cancelling…" : "Cancel request"}
        </Button>
      )}

      {order.status === "completed" && printDoc && (
        <Link href={printDoc.href(order.id)} target="_blank" className="text-primary block text-sm hover:underline">
          Download {printDoc.label} →
        </Link>
      )}
    </div>
  )
}
