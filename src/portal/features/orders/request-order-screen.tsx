"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useAuthorisePortalDestruction, useCreatePortalOrder, usePortalBoxes } from "@/api/portal"
import { BoxPicker } from "@/components/box-picker"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Card, CardContent } from "@/components/ui/card"
import type { OrderType } from "@/api/types"

const ORDER_TYPES: { type: OrderType; description: string }[] = [
  { type: "collection", description: "Have us collect new or returning boxes." },
  { type: "dispatch", description: "Ask us to send boxes to you." },
  { type: "destruction", description: "Request secure destruction of boxes you no longer need." },
]

export function RequestOrderScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [type, setType] = useState<OrderType | null>((searchParams.get("type") as OrderType) || null)
  const [boxIds, setBoxIds] = useState<string[]>([])
  const [address, setAddress] = useState("")
  const [expectedNewBoxes, setExpectedNewBoxes] = useState("0")
  const [authorised, setAuthorised] = useState(false)
  const [authName, setAuthName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: boxes } = usePortalBoxes({ page: 1 })
  const createOrder = useCreatePortalOrder()
  const authoriseDestruction = useAuthorisePortalDestruction()

  const needsBoxPicker = type === "dispatch" || type === "destruction"
  const needsAuthorisation = type === "destruction"

  async function submit() {
    if (!type) return
    if (needsAuthorisation && (!authorised || !authName)) {
      setError("Please confirm authorisation and type your name")
      return
    }
    setError(null)
    try {
      const order = await createOrder.mutateAsync({
        type,
        boxIds: boxIds.length ? boxIds : undefined,
        expectedNewBoxes: type === "collection" ? Number(expectedNewBoxes) || 0 : undefined,
        address: address || undefined,
      })
      if (needsAuthorisation) {
        await authoriseDestruction.mutateAsync({ orderId: order.id, name: authName })
      }
      toast.success(`Request submitted — order ${order.orderNumber}`)
      router.push(`/portal/orders/${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the request")
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Request an order</h1>
      </div>

      {!type && (
        <div className="grid gap-3 sm:grid-cols-3">
          {ORDER_TYPES.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => setType(opt.type)}
              className="hover:border-primary/50 rounded-lg border p-4 text-left transition-colors"
            >
              <OrderTypeLabel type={opt.type} />
              <p className="text-muted-foreground mt-2 text-sm">{opt.description}</p>
            </button>
          ))}
        </div>
      )}

      {type && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center justify-between">
              <OrderTypeLabel type={type} />
              <Button variant="ghost" size="sm" onClick={() => setType(null)}>
                Change type
              </Button>
            </div>

            <FieldGroup>
              {type === "collection" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="address">Collection address</FieldLabel>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="expected">New boxes to collect</FieldLabel>
                    <Input
                      id="expected"
                      type="number"
                      min={0}
                      value={expectedNewBoxes}
                      onChange={(e) => setExpectedNewBoxes(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Also returning any boxes?</FieldLabel>
                    <BoxPicker boxes={boxes?.items ?? []} type="collection" selectedIds={boxIds} onChange={setBoxIds} />
                  </Field>
                </>
              )}

              {needsBoxPicker && (
                <Field>
                  <FieldLabel>Choose boxes</FieldLabel>
                  <BoxPicker boxes={boxes?.items ?? []} type={type} selectedIds={boxIds} onChange={setBoxIds} />
                </Field>
              )}

              {needsAuthorisation && (
                <div className="bg-muted/50 space-y-3 rounded-lg border p-4">
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={authorised} onCheckedChange={(v) => setAuthorised(!!v)} className="mt-0.5" />
                    I authorise the destruction of these {boxIds.length} box{boxIds.length === 1 ? "" : "es"}.
                  </label>
                  <Field>
                    <FieldLabel htmlFor="auth-name">Type your full name to confirm</FieldLabel>
                    <Input id="auth-name" value={authName} onChange={(e) => setAuthName(e.target.value)} />
                  </Field>
                </div>
              )}

              <FieldError errors={error ? [{ message: error }] : undefined} />

              <Button
                type="button"
                onClick={submit}
                disabled={createOrder.isPending || (needsBoxPicker && boxIds.length === 0)}
              >
                {createOrder.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
