"use client"

import { Warehouse } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"

import { useWarehouses } from "@/api/warehouses"
import { CapacityBar } from "@/components/capacity-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function WarehouseLayoutScreen() {
  const { data: warehouses, isLoading } = useWarehouses()

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Warehouse}
        title="Warehouse layout"
        description="Block/unblock a slot or change its capacity from the rack's slot grid."
      />

      {isLoading && <Skeleton className="h-40 w-full max-w-xl" />}

      {warehouses?.map((warehouse) => (
        <Card key={warehouse.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {warehouse.code} — {warehouse.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-xs">
              <CapacityBar used={warehouse.usedCapacity} total={warehouse.totalCapacity} />
            </div>
            <Link
              href={`/app/warehouses/${warehouse.id}`}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              View racks →
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
