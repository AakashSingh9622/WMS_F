"use client"

import { usePathname } from "next/navigation"

import { useBox } from "@/api/boxes"
import { useOrder } from "@/api/orders"
import { useRack, useWarehouse } from "@/api/warehouses"
import { routeLabels } from "@/domain/navigation"
import { useGetAllClientsQuery } from "@/store/docusoftApi"
import { useAppSelector } from "@/store/hooks"

export interface Breadcrumb {
  href: string
  label: string
}

function labelFor(segment: string): string {
  if (routeLabels[segment]) return routeLabels[segment]
  if (/^[a-f0-9-]{6,}$/i.test(segment) || /^\d+$/.test(segment)) return segment
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * No useMatches()/handle in the App Router — breadcrumbs are derived from the pathname instead.
 *
 * An id segment (a warehouse / rack / order / box / client id) is shown as that record's own name
 * ("Central Warehouse", "COL-000001", "BX00000003", "TATA LIMITED") once it has loaded, and the raw id
 * only until then. The lookups reuse the queries the page itself already makes (same query keys /
 * the shared DocuSoft cache), so they don't cost extra requests.
 */
export function useBreadcrumbs(): Breadcrumb[] {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  // Only staff routes have these records behind the real staff API (the portal has its own, scoped one).
  const isStaff = segments[0] === "app"

  // The id that follows a collection segment, e.g. the one after "warehouses" — but not "new"/"pick"/etc.
  function idAfter(parent: string): string {
    const index = segments.indexOf(parent)
    const next = index >= 0 ? segments[index + 1] : undefined
    return isStaff && next && !routeLabels[next] ? next : ""
  }

  const warehouseId = idAfter("warehouses")
  const rackId = idAfter("racks")
  const orderId = idAfter("orders")
  const boxId = idAfter("boxes")
  const clientId = idAfter("clients")

  const { data: warehouse } = useWarehouse(warehouseId)
  const { data: rack } = useRack(rackId)
  const { data: order } = useOrder(orderId)
  const { data: box } = useBox(boxId)

  // Client names live in DocuSoft: use the client picked on the Clients screen, else the cached client list.
  const selectedClient = useAppSelector((state) => state.clientsUi.selectedClient)
  const clientIsSelected = !!clientId && selectedClient?.ClientID === clientId
  const { data: allClients } = useGetAllClientsQuery(undefined, { skip: !clientId || clientIsSelected })
  const clientName = clientIsSelected
    ? selectedClient?.Client
    : allClients?.find((c) => c.ClientId === clientId)?.Client

  const names: Record<string, string | undefined> = {
    [warehouseId]: warehouse?.name,
    [rackId]: rack?.label,
    [orderId]: order?.orderNumber,
    [boxId]: box?.boxNumber,
    [clientId]: clientName,
  }

  return segments.map((segment, index) => ({
    href: "/" + segments.slice(0, index + 1).join("/"),
    label: (segment && names[segment]) || labelFor(segment),
  }))
}
