"use client"

import { useState } from "react"

import { usePutAway } from "@/api/boxes"
import { ArrowUpFromLine } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { ScanInput, ScanLog, useScanLog } from "@/components/scan-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Put-away by barcode (spec §6.1): scan the box, then the slot label on the shelf. A box at Goods-In, a registered box
 * or a box being moved all work the same way. Anything that doesn't fit is refused and goes to the supervisor queue.
 */
export function PutAwayScreen() {
  const putAway = usePutAway()
  const log = useScanLog()
  const [boxCode, setBoxCode] = useState<string | null>(null)

  async function scan(code: string) {
    if (!boxCode) {
      setBoxCode(code)
      return
    }
    try {
      const res = await putAway.mutateAsync({ boxBarcode: boxCode, slotBarcode: code })
      const at = res.box.locationPath
      log.add(
        true,
        `${res.box.boxNumber} → ${at ? `${at.warehouse} › ${at.rack} › ${at.slot}` : code} (${res.slot.used}/${res.slot.capacity} cm)`,
      )
    } catch (err) {
      log.add(false, `${boxCode} → ${code}: ${err instanceof Error ? err.message : "not put away"}`)
    } finally {
      setBoxCode(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        icon={ArrowUpFromLine}
        title="Put away"
        description="Scan a box, then the slot label where you put it."
      />
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">
            {boxCode ? (
              <>
                Box <span className="font-mono">{boxCode}</span> — now scan the <strong>slot</strong>
              </>
            ) : (
              <>
                Scan the <strong>box</strong>
              </>
            )}
          </p>
          <ScanInput label={boxCode ? "Slot barcode" : "Box barcode"} onScan={scan} />
          {boxCode && (
            <Button variant="ghost" size="sm" onClick={() => setBoxCode(null)}>
              Start again
            </Button>
          )}
        </CardContent>
      </Card>
      <ScanLog entries={log.entries} />
    </div>
  )
}
