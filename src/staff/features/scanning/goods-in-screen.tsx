"use client"

import Link from "next/link"
import { useState } from "react"

import { useReceiveAtGoodsIn } from "@/api/boxes"
import { useWarehouses } from "@/api/warehouses"
import { ArrowDownToLine } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { ScanInput, ScanLog, useScanLog } from "@/components/scan-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Newly registered boxes arriving at a warehouse: scan each one into that warehouse's Goods-In (spec §6.1). */
export function GoodsInScreen() {
  const { data: warehouses } = useWarehouses()
  const [warehouseId, setWarehouseId] = useState("")
  const receive = useReceiveAtGoodsIn()
  const log = useScanLog()
  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id

  async function scan(barcode: string) {
    try {
      const res = await receive.mutateAsync({ barcode, warehouseId })
      log.add(true, `${res.box.boxNumber} ${res.alreadyReceived ? "was already at" : "arrived at"} Goods-In`)
    } catch (err) {
      log.add(false, `${barcode}: ${err instanceof Error ? err.message : "not received"}`)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        icon={ArrowDownToLine}
        title="Goods-In"
        description="Scan boxes as they arrive. They wait at Goods-In until they are put away on a shelf."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/boxes/put-away" />}>
            Put away
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field>
            <FieldLabel htmlFor="gi-warehouse">Warehouse</FieldLabel>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
              <SelectTrigger id="gi-warehouse">
                <SelectValue placeholder="Where are the boxes arriving?" getLabel={warehouseName} />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Only boxes registered here and not yet received can be scanned in.</FieldDescription>
          </Field>
          <ScanInput label="Box barcode" disabled={!warehouseId} onScan={scan} />
        </CardContent>
      </Card>
      <ScanLog entries={log.entries} />
    </div>
  )
}
