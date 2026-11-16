"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useClientProfile, useSaveClientProfile, type ClientProfile } from "@/api/clientProfile"
import { useCustomFields } from "@/api/customFields"
import {
  DEFAULT_DELIVERY_COLUMNS,
  DELIVERY_COLUMN_KEYS,
  deliveryColumnLabel,
} from "@/domain/delivery-columns"
import { useCan } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

type Form = Omit<ClientProfile, "clientId" | "deliveryColumns">
const FIELDS: { key: keyof Form; label: string; wide?: boolean }[] = [
  { key: "sapCode", label: "SAP / accounting code" },
  { key: "taxId", label: "Tax ID (NIF / VAT)" },
  { key: "address", label: "Postal address", wide: true },
  { key: "postcode", label: "Postcode" },
  { key: "city", label: "City" },
  { key: "province", label: "Province / county" },
]

function ProfileForm({ clientId, profile }: { clientId: string; profile: ClientProfile }) {
  const save = useSaveClientProfile(clientId)
  const canEdit = useCan("settings.manage")
  const [form, setForm] = useState<Form>({
    sapCode: profile.sapCode,
    taxId: profile.taxId,
    address: profile.address,
    postcode: profile.postcode,
    city: profile.city,
    province: profile.province,
  })
  const dirty = FIELDS.some((f) => form[f.key] !== profile[f.key])

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <Field key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
          <FieldLabel htmlFor={`cp-${f.key}`}>{f.label}</FieldLabel>
          <Input
            id={`cp-${f.key}`}
            value={form[f.key]}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          />
        </Field>
      ))}
      {canEdit ? (
        <div className="sm:col-span-2">
          <Button
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(form, {
                onSuccess: () => toast.success("Client details saved"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save details"}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs sm:col-span-2">Only people who manage settings can change these.</p>
      )}
    </div>
  )
}

/**
 * Which columns this client's delivery note prints for each box, and in what order (Docbox "Formato" and
 * "Ordenación C1,C2,C3"): tick the ones wanted, use the arrows to reorder. The box number is always printed.
 */
function DeliveryColumnsEditor({ clientId, profile }: { clientId: string; profile: ClientProfile }) {
  const save = useSaveClientProfile(clientId)
  const canEdit = useCan("settings.manage")
  const { data: fields = [] } = useCustomFields(clientId)
  const saved = profile.deliveryColumns.length ? profile.deliveryColumns : DEFAULT_DELIVERY_COLUMNS
  const [chosen, setChosen] = useState<string[]>(saved)
  const everything = [...DELIVERY_COLUMN_KEYS, ...fields.map((f) => f.code)] as string[]
  // chosen first (in order), then the rest unticked
  const rows = [...chosen.filter((k) => everything.includes(k)), ...everything.filter((k) => !chosen.includes(k))]
  const dirty = JSON.stringify(chosen) !== JSON.stringify(saved)
  const move = (key: string, by: -1 | 1) => {
    const i = chosen.indexOf(key)
    const j = i + by
    if (i < 0 || j < 0 || j >= chosen.length) return
    const next = [...chosen]
    ;[next[i], next[j]] = [next[j], next[i]]
    setChosen(next)
  }
  return (
    <section className="max-w-xl space-y-3 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Delivery note columns</h2>
        <p className="text-muted-foreground text-xs">What the delivery note lists for each box, in this order.</p>
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {rows.map((key) => {
          const on = chosen.includes(key)
          return (
            <li key={key} className="flex items-center gap-3 px-3 py-1.5">
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, key] : chosen.filter((k) => k !== key))}
                />
                <span className={on ? "" : "text-muted-foreground"}>{deliveryColumnLabel(key, fields)}</span>
              </label>
              {on && canEdit && (
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Move up" disabled={chosen[0] === key} onClick={() => move(key, -1)}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Move down" disabled={chosen[chosen.length - 1] === key} onClick={() => move(key, 1)}>
                    ↓
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {canEdit && (
        <Button
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(
              { deliveryColumns: chosen },
              {
                onSuccess: () => toast.success("Delivery note columns saved"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
              }
            )
          }
        >
          {save.isPending ? "Saving…" : "Save columns"}
        </Button>
      )}
    </section>
  )
}

/**
 * The details the warehouse keeps about a client on top of DocuSoft's (Docbox "Clientes"): the SAP / accounting code
 * and tax ID that must match the client's invoices, and a postal address.
 */
export function ClientProfileCard({ clientId }: { clientId: string }) {
  const { data, isLoading } = useClientProfile(clientId)
  return (
    <section className="max-w-xl space-y-3 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Warehouse details</h2>
        <p className="text-muted-foreground text-xs">Kept here, next to what DocuSoft holds for this client.</p>
      </div>
      {isLoading || !data ? <Skeleton className="h-32 w-full" /> : <ProfileForm key={JSON.stringify(data)} clientId={clientId} profile={data} />}
      {data && <DeliveryColumnsEditor key={JSON.stringify(data.deliveryColumns)} clientId={clientId} profile={data} />}
    </section>
  )
}
