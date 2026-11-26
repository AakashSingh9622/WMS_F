"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useClientProfile, useSaveClientProfile, type ClientProfile } from "@/api/clientProfile"
import { useCustomFields } from "@/api/customFields"
import { DEFAULT_DELIVERY_COLUMNS } from "@/domain/delivery-columns"
import { DeliveryColumnsPicker } from "@/components/delivery-columns-picker"
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
function DeliveryColumnsEditor({
  clientId,
  profile,
  bare,
}: {
  clientId: string
  profile: ClientProfile
  bare?: boolean // without the top rule (it stands on its own)
}) {
  const save = useSaveClientProfile(clientId)
  const canEdit = useCan("settings.manage")
  const { data: fields = [] } = useCustomFields(clientId)
  const saved = profile.deliveryColumns.length ? profile.deliveryColumns : DEFAULT_DELIVERY_COLUMNS
  const [chosen, setChosen] = useState<string[]>(saved)
  const dirty = JSON.stringify(chosen) !== JSON.stringify(saved)
  return (
    <section className={bare ? "max-w-xl space-y-3" : "max-w-xl space-y-3 border-t pt-6"}>
      <div>
        <h2 className="text-sm font-semibold">Delivery note columns</h2>
        <p className="text-muted-foreground text-xs">What the delivery note lists for each box, in this order.</p>
      </div>
      <DeliveryColumnsPicker fields={fields} value={chosen} onChange={setChosen} canEdit={canEdit} />
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

/** Only the delivery note columns of a client (the Add client panel's Delivery Note step) — the same editor as below. */
export function ClientDeliveryNoteColumns({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useClientProfile(clientId)
  if (isError) return <p className="text-destructive text-sm">Couldn&apos;t load this client&apos;s delivery note.</p>
  if (isLoading || !data) return <Skeleton className="h-48 w-full max-w-xl" />
  return <DeliveryColumnsEditor key={JSON.stringify(data.deliveryColumns)} clientId={clientId} profile={data} bare />
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
