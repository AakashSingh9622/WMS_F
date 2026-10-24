"use client"

import { useState } from "react"

import { useCan } from "@/auth/useAuth"
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
  const clientName = (id: string) =>
    id === ALL ? "All clients" : (clients?.find((c) => c.ClientId === id)?.Client ?? id)

  const href = (kind: string, withDates: boolean) => {
    const sp = new URLSearchParams()
    if (clientId !== ALL) sp.set("clientId", clientId)
    if (withDates && from) sp.set("from", from)
    if (withDates && to) sp.set("to", to)
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
