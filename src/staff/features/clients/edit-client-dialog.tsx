"use client"

import { useState } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Pencil } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_COUNTRY } from "@/domain/countries"
import { useClientCard } from "@/hooks/useClientCard"
import {
  ACTIVE_LABEL,
  CountryCountyFields,
  errorText,
  fullAddress,
  hasAddress,
  optionalEmail,
  SelectField,
  TextField,
} from "@/staff/features/clients/client-form-fields"
import {
  useGetConfigurationQuery,
  useSetClientAddressMutation,
  useUpdateClientFieldMutation,
  useUpdateClientMutation,
  type DocusoftAddress,
  type DocusoftClientRecord,
  type DocusoftConfiguration,
} from "@/store/docusoftApi"

const addressSchema = z.object({
  add1: z.string().trim(),
  add2: z.string().trim(),
  add3: z.string().trim(),
  town: z.string().trim(),
  county: z.string().trim(),
  postcode: z.string().trim(),
  country: z.string().trim(),
})

const schema = z.object({
  name: z.string().trim().min(1, "Enter the client name").max(200, "At most 200 characters"),
  managerId: z.string().min(1, "Choose a manager"),
  statusId: z.string(),
  businessId: z.string(),
  sourceId: z.string(),
  active: z.enum(["Yes", "No", "HID"]),
  email: optionalEmail,
  tel: z.string().trim(),
  altTel: z.string().trim(),
  add1: z.string().trim(),
  add2: z.string().trim(),
  add3: z.string().trim(),
  town: z.string().trim(),
  county: z.string().trim(),
  postcode: z.string().trim(),
  country: z.string().trim(),
  description: z.string().trim(),
  billing: addressSchema,
  registered: addressSchema,
})
type Values = z.infer<typeof schema>
type AddressValues = z.infer<typeof addressSchema>
type ExtraAddress = "billing" | "registered"
const EXTRA_ADDRESSES: { key: ExtraAddress; id: 2 | 3; title: string }[] = [
  { key: "billing", id: 2, title: "Billing address" },
  { key: "registered", id: 3, title: "Registered address" },
]

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const toAddress = (a?: DocusoftAddress): AddressValues => ({
  add1: s(a?.Add1),
  add2: s(a?.Add2),
  add3: s(a?.Add3),
  town: s(a?.Town),
  county: s(a?.County),
  postcode: s(a?.Postcode),
  country: s(a?.Country) || DEFAULT_COUNTRY,
})
const same = (a: unknown, b: unknown) => s(a).toLowerCase() === s(b).toLowerCase()

/**
 * The form's starting values from what DocuSoft holds. The card gives Status / Source / Manager by NAME, so they are
 * matched to the ids of Json_GetConfiguration's lists (as DocuSoft's own edit page does); Business comes as an id.
 */
function toValues(
  record: DocusoftClientRecord,
  config: DocusoftConfiguration,
  main?: DocusoftAddress,
  billing?: DocusoftAddress,
  registered?: DocusoftAddress,
): Values {
  const active = s(record.OrgActive)
  return {
    name: s(record.OriginatorName),
    managerId: s(config.users.find((u) => same(u.UserName, record.UserName))?.UserId),
    statusId: s(config.statuses.find((x) => same(x.StatusName, record.StatusName))?.StatusId),
    businessId: s(record.BussID ?? config.businesses.find((x) => same(x.BussName, record.BussName))?.BussId),
    sourceId: s(config.sources.find((x) => same(x.SourceName, record.SourceName))?.SourceId),
    active: active === "No" || active === "HID" ? active : "Yes",
    email: s(record.Email),
    tel: s(record.TelNo),
    altTel: s(record.AltTelNo),
    add1: s(main?.Add1),
    add2: s(main?.Add2),
    add3: s(main?.Add3),
    town: s(main?.Town),
    county: s(main?.County),
    postcode: s(main?.Postcode),
    country: s(main?.Country) || DEFAULT_COUNTRY,
    description: s(record.Description),
    billing: toAddress(billing),
    registered: toAddress(registered),
  }
}

/** Billing or Registered address: the same fields as the main address, with a one-click copy of it. */
function ExtraAddressFields({
  name,
  title,
  form,
}: {
  name: ExtraAddress
  title: string
  form: UseFormReturn<Values>
}) {
  const { register, control, setValue, getValues } = form
  const [country, county] = useWatch({ control, name: [`${name}.country`, `${name}.county`] })
  const id = (f: string) => `ec-${name}-${f}`
  const copyMain = () => {
    const v = getValues()
    for (const k of ["add1", "add2", "add3", "town", "county", "postcode", "country"] as const) {
      setValue(`${name}.${k}`, v[k], { shouldDirty: true })
    }
  }
  return (
    <section className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={copyMain}>
          Same as main address
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id={id("a1")} label="Line 1" name={`${name}.add1`} register={register} />
        <TextField id={id("a2")} label="Line 2" name={`${name}.add2`} register={register} />
        <TextField id={id("a3")} label="Line 3" name={`${name}.add3`} register={register} />
        <TextField id={id("town")} label="Town" name={`${name}.town`} register={register} />
        <TextField id={id("pc")} label="Postcode" name={`${name}.postcode`} register={register} />
        <CountryCountyFields
          idPrefix={`ec-${name}`}
          country={country}
          county={county}
          onCountry={(val) => setValue(`${name}.country`, val, { shouldDirty: true })}
          onCounty={(val) => setValue(`${name}.county`, val, { shouldDirty: true })}
        />
      </div>
    </section>
  )
}

function EditClientForm({
  clientId,
  projectId,
  record,
  config,
  main,
  billing,
  registered,
  onDone,
}: {
  clientId: string
  projectId: number
  record: DocusoftClientRecord
  config: DocusoftConfiguration
  main?: DocusoftAddress
  billing?: DocusoftAddress
  registered?: DocusoftAddress
  onDone: () => void
}) {
  const [updateClient] = useUpdateClientMutation()
  const [updateField] = useUpdateClientFieldMutation()
  const [setAddress] = useSetClientAddressMutation()
  const [formError, setFormError] = useState<string | null>(null)
  const [initial] = useState(() => toValues(record, config, main, billing, registered))

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial })
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = form
  const [country, county] = useWatch({ control, name: ["country", "county"] })

  const onSubmit = async (v: Values) => {
    setFormError(null)
    const address = {
      add1: v.add1,
      add2: v.add2,
      add3: v.add3,
      town: v.town,
      county: v.county,
      postcode: v.postcode,
      country: v.country,
    }
    try {
      await updateClient({
        clientId,
        name: v.name,
        address: hasAddress(address) ? fullAddress(address) : "",
        tel: v.tel,
        altTel: v.altTel,
        statusId: v.statusId,
        businessId: v.businessId,
        sourceId: v.sourceId,
        managerId: v.managerId,
        description: v.description,
        orgPassword: s(record.OrgPassword), // not on this form — sent back unchanged
        active: v.active,
        cCode: record.CCode ?? "",
      }).unwrap()
    } catch (err) {
      setFormError(errorText(err))
      return
    }

    // The client is updated; the rest are separate calls, so a failure there is a warning, not a lost save.
    const warnings: string[] = []
    // Json_UpdateClient blanks the email, so it is always written back (as DocuSoft's own page does).
    try {
      await updateField({ clientId, projectId, fieldName: "Email", fieldValue: v.email }).unwrap()
    } catch (err) {
      warnings.push(`the email (${errorText(err)})`)
    }
    // The main address: saved when there is one now, or there was one before (so clearing it is saved too).
    const addressChanged = (Object.keys(address) as (keyof typeof address)[]).some((k) => address[k] !== initial[k])
    if (addressChanged && (hasAddress(address) || main)) {
      try {
        await setAddress({ clientId, addressId: 1, ...address }).unwrap()
      } catch (err) {
        warnings.push(`the address (${errorText(err)})`)
      }
    }
    // Billing (2) and Registered (3): the same rule — only when changed, and when there is (or was) one.
    const existing = { billing, registered }
    for (const extra of EXTRA_ADDRESSES) {
      const now = v[extra.key]
      const before = initial[extra.key]
      const changed = (Object.keys(now) as (keyof AddressValues)[]).some((k) => now[k] !== before[k])
      if (!changed || (!hasAddress(now) && !existing[extra.key])) continue
      try {
        await setAddress({ clientId, addressId: extra.id, ...now }).unwrap()
      } catch (err) {
        warnings.push(`the ${extra.title.toLowerCase()} (${errorText(err)})`)
      }
    }

    if (warnings.length) toast.warning(`Client updated, but DocuSoft didn't save ${warnings.join(" or ")}`)
    else toast.success(`${v.name} updated in DocuSoft`)
    onDone()
  }

  const opts = {
    users: config.users.map((u) => ({ value: s(u.UserId), label: u.UserName })),
    statuses: config.statuses.map((x) => ({ value: s(x.StatusId), label: x.StatusName })),
    businesses: config.businesses.map((x) => ({ value: s(x.BussId), label: x.BussName })),
    sources: config.sources.map((x) => ({ value: s(x.SourceId), label: x.SourceName })),
    active: (Object.keys(ACTIVE_LABEL) as (keyof typeof ACTIVE_LABEL)[]).map((k) => ({
      value: k,
      label: ACTIVE_LABEL[k],
    })),
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Company details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ec-id">Client reference</FieldLabel>
            {/* renaming the reference is a separate DocuSoft action (Json_ChangeClientID) — not done here */}
            <Input id="ec-id" value={clientId} disabled readOnly />
          </Field>
          <TextField id="ec-name" label="Client name" name="name" register={register} error={errors.name} required />
          <SelectField
            id="ec-manager"
            label="Manager"
            name="managerId"
            control={control}
            options={opts.users}
            required
          />
          <SelectField id="ec-status" label="Status" name="statusId" control={control} options={opts.statuses} />
          <SelectField
            id="ec-business"
            label="Business type"
            name="businessId"
            control={control}
            options={opts.businesses}
          />
          <SelectField id="ec-source" label="Source" name="sourceId" control={control} options={opts.sources} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="ec-email"
            label="Company email"
            name="email"
            type="email"
            register={register}
            error={errors.email}
          />
          <TextField id="ec-tel" label="Telephone" name="tel" type="tel" register={register} />
          <TextField id="ec-alt" label="Other telephone" name="altTel" type="tel" register={register} />
        </div>
        <SelectField id="ec-active" label="State" name="active" control={control} options={opts.active} />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Main address</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="ec-a1" label="Line 1" name="add1" register={register} />
          <TextField id="ec-a2" label="Line 2" name="add2" register={register} />
          <TextField id="ec-a3" label="Line 3" name="add3" register={register} />
          <TextField id="ec-town" label="Town" name="town" register={register} />
          <TextField id="ec-pc" label="Postcode" name="postcode" register={register} />
          <CountryCountyFields
            idPrefix="ec"
            country={country}
            county={county}
            onCountry={(val) => setValue("country", val, { shouldDirty: true })}
            onCounty={(val) => setValue("county", val, { shouldDirty: true })}
          />
        </div>
        <Field>
          <FieldLabel htmlFor="ec-desc">Description</FieldLabel>
          <Textarea id="ec-desc" rows={2} {...register("description")} />
        </Field>
      </section>

      {EXTRA_ADDRESSES.map((a) => (
        <ExtraAddressFields key={a.key} name={a.key} title={a.title} form={form} />
      ))}

      {formError && <p className="text-destructive rounded-md border border-current/30 p-3 text-sm">{formError}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

/**
 * "Edit client" on a client's page: change what DocuSoft holds about it (name, manager, status, contact details,
 * main address, …) — saved straight in DocuSoft, never in our database. Like Add client, it closes only with ✕ or
 * Cancel, so a click outside can't throw away the changes.
 */
export function EditClientButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const { record, mainAddress, billingAddress, registeredAddress, projectId, isLoading } = useClientCard(clientId)
  const config = useGetConfigurationQuery(undefined, { skip: !open })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={isLoading || !record}>
        <Pencil className="size-4" aria-hidden />
        Edit client
      </Button>
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next, details) => {
          if (!next && details.reason === "escape-key") return
          setOpen(next)
        }}
      >
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {s(record?.OriginatorName) || clientId}</DialogTitle>
            <DialogDescription>Saved in DocuSoft.</DialogDescription>
          </DialogHeader>
          {config.isError ? (
            <p className="text-destructive text-sm">
              DocuSoft&apos;s lists couldn&apos;t be loaded: {errorText(config.error)}
            </p>
          ) : !config.data || !record || projectId === undefined ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            // a fresh form, from what DocuSoft holds now, every time it opens
            <EditClientForm
              clientId={clientId}
              projectId={projectId}
              record={record}
              config={config.data}
              main={mainAddress}
              billing={billingAddress}
              registered={registeredAddress}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
