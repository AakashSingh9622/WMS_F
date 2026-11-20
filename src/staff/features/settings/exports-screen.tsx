"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { useWarehouseRacks, useWarehouses } from "@/api/warehouses"
import { useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { Download } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseCsv } from "@/lib/csv"
import { downloadXlsx } from "@/lib/spreadsheet"
import { SHELVING_SHEET, shelvingFileName } from "@/lib/shelving-excel"

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
  const [expediente, setExpediente] = useState("")
  const [site, setSite] = useState("")
  const [zone, setZone] = useState("")
  const [aisle, setAisle] = useState("")
  const [boxFrom, setBoxFrom] = useState("")
  const [boxTo, setBoxTo] = useState("")
  const [palletFrom, setPalletFrom] = useState("")
  const [palletTo, setPalletTo] = useState("")
  const [containerFrom, setContainerFrom] = useState("")
  const [containerTo, setContainerTo] = useState("")
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
      if (expediente.trim()) sp.set("expediente", expediente.trim())
      if (site.trim()) sp.set("site", site.trim())
      if (containerFrom.trim()) sp.set("containerFrom", containerFrom.trim())
      if (containerTo.trim()) sp.set("containerTo", containerTo.trim())
      if (zone.trim()) sp.set("zone", zone.trim())
      if (aisle.trim()) sp.set("aisle", aisle.trim())
      if (boxFrom.trim()) sp.set("boxFrom", boxFrom.trim())
      if (boxTo.trim()) sp.set("boxTo", boxTo.trim())
      if (palletFrom.trim()) sp.set("palletFrom", palletFrom.trim())
      if (palletTo.trim()) sp.set("palletTo", palletTo.trim())
    }
    const q = sp.toString()
    return `/api/exports/${kind}.csv${q ? `?${q}` : ""}`
  }

  // Excel = the same rows as the CSV (so the same filters), written as an .xlsx in the browser.
  const [busy, setBusy] = useState("")
  async function downloadExcel(kind: string, label: string, url: string) {
    setBusy(kind)
    try {
      const res = await fetch(url, { credentials: "same-origin" })
      if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to this export." : "The export failed. Try again.")
      const rows = parseCsv(await res.text())
      if (rows.length === 0) throw new Error("Nothing to export.")
      // the shelving sheet has its own approved file and sheet name
      if (kind === "record-shelving") await downloadXlsx(shelvingFileName(), rows, SHELVING_SHEET)
      else await downloadXlsx(`${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`, rows, label.slice(0, 31))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the Excel file.")
    } finally {
      setBusy("")
    }
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
      kind: "record-loans",
      label: "Records on loan",
      help: "Every record that is out with a client right now (physical loans only): the client's own fields as columns, who asked, when, and when it was issued. With a client chosen you get that client's field names; the dates filter the request date.",
      dates: true,
      show: true,
    },
    {
      kind: "record-shelving",
      label: "Returned records to shelve",
      help: "Records that came back and are in storage again, with the physical location of their box (warehouse, zone, aisle, shelving unit, row, position) in walking order, so they can be shelved. Choose a client and the From / To dates of the return; unallocated boxes come last.",
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
        <p className="text-muted-foreground text-sm">Download data as an Excel (.xlsx) file, or as CSV.</p>
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
          <FieldLabel htmlFor="ex-rack">Module</FieldLabel>
          <Select
            value={rackId}
            onValueChange={(v) => {
              setRackId(v ?? ALL)
              setRow("")
            }}
            disabled={warehouseId === ALL}
          >
            <SelectTrigger id="ex-rack">
              <SelectValue getLabel={(id) => (id === ALL ? "All modules" : (racks?.find((r) => r.id === id)?.label ?? id))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modules</SelectItem>
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
      <div className="grid gap-4 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="ex-expediente">Expediente</FieldLabel>
          <Input id="ex-expediente" placeholder="All — its code" value={expediente} onChange={(e) => setExpediente(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-site">Site (Sede)</FieldLabel>
          <Input id="ex-site" placeholder="All sites" value={site} onChange={(e) => setSite(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-zone">Block / Floor</FieldLabel>
          <Input id="ex-zone" placeholder="All floors — code or name" value={zone} onChange={(e) => setZone(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-aisle">Aisle</FieldLabel>
          <Input id="ex-aisle" placeholder="All aisles — code or name" value={aisle} onChange={(e) => setAisle(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="ex-box-from">Box number from</FieldLabel>
          <Input id="ex-box-from" placeholder="e.g. 125" value={boxFrom} onChange={(e) => setBoxFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-box-to">Box number to</FieldLabel>
          <Input id="ex-box-to" placeholder="e.g. 140" value={boxTo} onChange={(e) => setBoxTo(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-pal-from">Pallet from</FieldLabel>
          <Input id="ex-pal-from" inputMode="numeric" value={palletFrom} onChange={(e) => setPalletFrom(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-pal-to">Pallet to</FieldLabel>
          <Input id="ex-pal-to" inputMode="numeric" value={palletTo} onChange={(e) => setPalletTo(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="ex-con-from">Container from</FieldLabel>
          <Input id="ex-con-from" inputMode="numeric" value={containerFrom} onChange={(e) => setContainerFrom(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-con-to">Container to</FieldLabel>
          <Input id="ex-con-to" inputMode="numeric" value={containerTo} onChange={(e) => setContainerTo(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <FieldDescription>
        These only narrow the Inventory download. A box number like 125 means BX00000125. Pallet and container ranges use whole numbers; boxes whose
        pallet or container isn&apos;t a number are left out when a range is set.
      </FieldDescription>

      <ul className="bg-card divide-y rounded-2xl border">
        {exports
          .filter((e) => e.show)
          .map((e) => (
            <li key={e.kind} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1">
                <p className="font-medium">{e.label}</p>
                <p className="text-muted-foreground text-sm">{e.help}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={busy === e.kind}
                  onClick={() => void downloadExcel(e.kind, e.label, href(e.kind, e.dates))}
                >
                  <Download /> {busy === e.kind ? "Preparing…" : "Excel"}
                </Button>
                <Button variant="outline" nativeButton={false} render={<a href={href(e.kind, e.dates)} />}>
                  <Download /> CSV
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </div>
  )
}
