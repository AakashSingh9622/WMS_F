"use client"

import { useState } from "react"

import { useCan } from "@/auth/useAuth"
import { useWarehouseRacks, useWarehouses } from "@/api/warehouses"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { Download } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "__all__"

/** CSV downloads (spec §4.6 / §8): Excel-ready, streamed straight from the API so even big ranges work. */
export function ExportsScreen() {
  const canAudit = useCan("audit.read")
  const canBilling = useCan("billing.view")
  const { data: clients } = useGetClientsWithDetailsQuery()
  const [clientId, setClientId] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  // Inventory only: narrow to one warehouse / rack / shelf row (Docbox "Exportar archivo").
  const { data: warehouses } = useWarehouses()
  const [warehouseId, setWarehouseId] = useState(ALL)
  const [rackId, setRackId] = useState(ALL)
  const [row, setRow] = useState("")
  const { data: racks } = useWarehouseRacks(warehouseId === ALL ? "" : warehouseId)
  const clientName = (id: string) =>
    id === ALL ? "All clients" : (clients?.find((c) => c.ClientId === id)?.Client ?? id)

  const href = (kind: string, withDates: boolean) => {
    const sp = new URLSearchParams()
    if (clientId !== ALL) sp.set("clientId", clientId)
    if (withDates && from) sp.set("from", from)
    if (withDates && to) sp.set("to", to)
    if (kind === "inventory") {
      if (warehouseId !== ALL) sp.set("warehouseId", warehouseId)
      if (warehouseId !== ALL && rackId !== ALL) sp.set("rackId", rackId)
      if (warehouseId !== ALL && rackId !== ALL && /^\d+$/.test(row)) sp.set("row", row)
    }
    const q = sp.toString()
    return `/api/exports/${kind}.csv${q ? `?${q}` : ""}`
  }

  const exports = [
    {
      kind: "inventory",
      label: "Inventory",
      help: "Every box with its status and location (today).",
      dates: false,
      show: true,
    },
    {
      kind: "movements",
      label: "Movements",
      help: "Put-aways, moves, dispatches, returns… in the date range.",
      dates: true,
      show: true,
    },
    {
      kind: "loans",
      label: "Loan register",
      help: "Everything out with clients on a dispatch order: who asked, when, and the original shelf (use the dates for when it was issued).",
      dates: true,
      show: true,
    },
    {
      kind: "toshelve",
      label: "Returns to shelve",
      help: "Boxes that came back and wait at Goods-In, with the shelf they were taken from.",
      dates: false,
      show: true,
    },
    {
      kind: "audit",
      label: "Box history",
      help: "Every box history event in the date range.",
      dates: true,
      show: canAudit,
    },
    {
      kind: "charges",
      label: "Charges",
      help: "Billable charges whose period ends in the date range.",
      dates: true,
      show: canBilling,
    },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Exports</h2>
        <p className="text-muted-foreground text-sm">Download data as CSV files that open in Excel.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="ex-client">Client</FieldLabel>
          <Select value={clientId} onValueChange={(v) => setClientId(v ?? ALL)}>
            <SelectTrigger id="ex-client">
              <SelectValue getLabel={clientName} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {clients?.map((c) => (
                <SelectItem key={c.ClientId} value={c.ClientId}>
                  {c.Client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-from">From</FieldLabel>
          <Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-to">To</FieldLabel>
          <Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <FieldDescription>Leave the dates empty for everything.</FieldDescription>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="ex-wh">Inventory: warehouse</FieldLabel>
          <Select
            value={warehouseId}
            onValueChange={(v) => {
              setWarehouseId(v ?? ALL)
              setRackId(ALL)
              setRow("")
            }}
          >
            <SelectTrigger id="ex-wh">
              <SelectValue
                getLabel={(id) => (id === ALL ? "All warehouses" : (warehouses?.find((w) => w.id === id)?.name ?? id))}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All warehouses</SelectItem>
              {warehouses?.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-rack">Rack</FieldLabel>
          <Select
            value={rackId}
            onValueChange={(v) => {
              setRackId(v ?? ALL)
              setRow("")
            }}
            disabled={warehouseId === ALL}
          >
            <SelectTrigger id="ex-rack">
              <SelectValue getLabel={(id) => (id === ALL ? "All racks" : (racks?.find((r) => r.id === id)?.label ?? id))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All racks</SelectItem>
              {racks?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-row">Shelf row</FieldLabel>
          <Input
            id="ex-row"
            inputMode="numeric"
            placeholder="All rows"
            value={row}
            disabled={rackId === ALL}
            onChange={(e) => setRow(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <FieldDescription>These three only narrow the Inventory download.</FieldDescription>

      <ul className="bg-card divide-y rounded-2xl border">
        {exports
          .filter((e) => e.show)
          .map((e) => (
            <li key={e.kind} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1">
                <p className="font-medium">{e.label}</p>
                <p className="text-muted-foreground text-sm">{e.help}</p>
              </div>
              <Button variant="outline" nativeButton={false} render={<a href={href(e.kind, e.dates)} />}>
                <Download /> CSV
              </Button>
            </li>
          ))}
      </ul>
    </div>
  )
}
