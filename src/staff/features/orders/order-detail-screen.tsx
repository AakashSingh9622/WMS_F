"use client"

import type { OrderLine } from "@/api/types"
import { formatDate, formatDateTime } from "@/lib/formatting"
import Link from "next/link"

import { useOrder, useOrderLines } from "@/api/orders"
import { useCan } from "@/auth/useAuth"
import { useAuditSearch } from "@/api/audit"
import { OrderActions } from "@/staff/features/orders/order-actions"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { OrderStatusBadge } from "@/components/status-badge"
import { StatusStepper } from "@/components/status-stepper"
import { AuditTimeline } from "@/components/audit-timeline"
import { LocationPath } from "@/components/location-path"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const PRINT_DOCS: Record<string, { label: string; href: (id: string) => string }> = {
  dispatch: { label: "Delivery note", href: (id) => `/print/delivery-note/${id}` },
  destruction: { label: "Certificate of destruction", href: (id) => `/print/destruction-certificate/${id}` },
}

const pathText = (l: { warehouse: string; rack: string; slot: string }) =>
  `${l.warehouse} › Rack ${l.rack} › Slot ${l.slot}`

// Where to find the box: its CURRENT slot while the line is still open (it may have been moved after the order was
// made); the slot it was taken from once the line is done. A moved box also shows where it was when added.
function LineLocation({ line }: { line: OrderLine }) {
  const open = line.status === "pending" || line.status === "picked"
  const shown = open ? (line.currentLocation ?? line.fromLocation) : (line.fromLocation ?? line.currentLocation)
  if (!shown) return <span className="text-muted-foreground">—</span>
  const moved =
    open && line.fromLocation && line.currentLocation && pathText(line.fromLocation) !== pathText(line.currentLocation)
  return (
    <div className="space-y-0.5">
      <LocationPath
        segments={[{ label: shown.warehouse }, { label: `Rack ${shown.rack}` }, { label: `Slot ${shown.slot}` }]}
      />
      {moved && line.fromLocation && (
        <p className="text-muted-foreground text-xs">Moved since added (was {pathText(line.fromLocation)})</p>
      )}
    </div>
  )
}

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId)
  const canRegister = useCan("boxes.operate")
  const { data: lines } = useOrderLines(orderId)
  const { data: activity } = useAuditSearch({ orderId, pageSize: 100 })

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!order) return null

  const printDoc = PRINT_DOCS[order.type]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{order.orderNumber}</h1>
          <OrderTypeLabel type={order.type} />
          <OrderStatusBadge status={order.status} />
          {order.permanentWithdrawal && <Badge variant="outline">Permanent withdrawal</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">
          <Link href={`/app/clients/${order.clientId}`} className="hover:text-primary hover:underline">
            {order.clientName}
          </Link>
        </p>
        <StatusStepper status={order.status} heldFrom={order.heldFromStatus} />
        {order.status === "on_hold" && order.holdReason && (
          <p className="text-status-hold text-sm">On hold: {order.holdReason}</p>
        )}
        {order.clientApprovalRequired && !order.clientApprovedAt && (
          <p className="text-status-hold text-sm">
            Waiting for the client&apos;s main contact to approve this request in the portal before it can be approved
            here.
          </p>
        )}
        {order.clientApprovedAt && (
          <p className="text-muted-foreground text-sm">
            Approved by the client ({order.clientApprovedBy}) on {formatDateTime(order.clientApprovedAt)}
          </p>
        )}
        {order.type === "destruction" &&
          order.destruction &&
          !order.destruction.approvedBy &&
          order.status !== "completed" && (
            <p className="text-muted-foreground text-sm">
              Needs a second signature: a records manager who didn&apos;t prepare this order approves it before the
              boxes can be destroyed.
            </p>
          )}
        <OrderActions order={order} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold">Lines ({lines?.length ?? 0})</h2>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="p-2 text-left">Box</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Line status</th>
                  <th className="p-2 text-left">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {(lines ?? []).map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="p-2">
                      {line.boxId ? (
                        <Link href={`/app/boxes/${line.boxId}`} className="text-primary hover:underline">
                          {line.boxNumber}
                        </Link>
                      ) : (
                        line.boxNumber
                      )}
                    </td>
                    <td className="p-2">
                      <LineLocation line={line} />
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{line.status}</Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {line.scannedBy ? `${line.scannedBy.name} at ${formatDateTime(line.scannedAt ?? "")}` : "—"}
                    </td>
                  </tr>
                ))}
                {(lines?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground p-4 text-center">
                      No lines on this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Activity</h2>
            <AuditTimeline events={activity?.items ?? []} />
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Created</span> {formatDate(order.createdAt)}
              </p>
              {order.scheduledFor && (
                <p>
                  <span className="text-muted-foreground">Scheduled</span> {formatDate(order.scheduledFor)}
                </p>
              )}
              {order.completedAt && (
                <p>
                  <span className="text-muted-foreground">Completed</span> {formatDate(order.completedAt)}
                </p>
              )}
              {order.address && (
                <p>
                  <span className="text-muted-foreground">Address</span> {order.address}
                </p>
              )}
              {(order.contactName || order.contactEmail) && (
                <p>
                  <span className="text-muted-foreground">Contact</span> {order.contactName}
                  {order.contactEmail && <span className="text-muted-foreground"> · {order.contactEmail}</span>}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Requested by</span> {order.requestedBy.name}
              </p>
            </CardContent>
          </Card>

          {order.destruction && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Authorisation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Method</span> {order.destruction.method}
                </p>
                <p>
                  <span className="text-muted-foreground">Authorised by</span>{" "}
                  {order.destruction.authorisedBy.replace(/ \((client|portal)\)$/, "")}
                </p>
                <p>
                  <span className="text-muted-foreground">Authorised at</span>{" "}
                  {formatDate(order.destruction.authorisedAt)}
                </p>
                {order.destruction.approvedBy && (
                  <p>
                    <span className="text-muted-foreground">Approved by</span> {order.destruction.approvedBy.name}
                    {order.destruction.approvedAt && ` on ${formatDate(order.destruction.approvedAt)}`}
                  </p>
                )}
                {order.destruction.witness && (
                  <p>
                    <span className="text-muted-foreground">Witness</span> {order.destruction.witness}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {order.digitization && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Digitising authorisation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Authorised by</span>{" "}
                  {order.digitization.authorisedBy.replace(/ \((client|portal)\)$/, "")}
                </p>
                <p>
                  <span className="text-muted-foreground">Authorised at</span>{" "}
                  {formatDate(order.digitization.authorisedAt)}
                </p>
                {order.digitization.note && (
                  <p>
                    <span className="text-muted-foreground">Note</span> {order.digitization.note}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {order.type === "digitize" &&
            !order.digitization &&
            order.status !== "cancelled" &&
            order.status !== "rejected" && (
              <p className="text-muted-foreground text-xs">Waiting for the client to authorise the digitising.</p>
            )}

          {order.collection && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Expected new boxes</span> {order.collection.expectedNewBoxes}
                </p>
                {canRegister && order.status !== "completed" && order.status !== "cancelled" && (
                  <Link
                    href={`/app/boxes/new?orderId=${order.id}&clientId=${order.clientId}`}
                    className="text-primary block hover:underline"
                  >
                    Register new boxes for this order →
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {order.delivery && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {order.delivery.courier && (
                  <p>
                    <span className="text-muted-foreground">Courier</span> {order.delivery.courier}
                    {order.delivery.trackingRef && ` · ${order.delivery.trackingRef}`}
                  </p>
                )}
                {order.delivery.dispatchedAt && (
                  <p>
                    <span className="text-muted-foreground">Dispatched</span>{" "}
                    {formatDateTime(order.delivery.dispatchedAt)}
                  </p>
                )}
                {order.delivery.receivedBy ? (
                  <p>
                    <span className="text-muted-foreground">Received by</span> {order.delivery.receivedBy}
                    {order.delivery.deliveredAt && ` on ${formatDateTime(order.delivery.deliveredAt)}`}
                    {order.delivery.proofReference && ` · proof ${order.delivery.proofReference}`}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Not confirmed as delivered yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* the delivery note goes with the boxes, so it can be printed once they are picked (ready) */}
          {printDoc && (order.status === "completed" || (order.type === "dispatch" && order.status === "ready")) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={printDoc.href(order.id)} target="_blank" className="text-primary text-sm hover:underline">
                  {printDoc.label} →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
