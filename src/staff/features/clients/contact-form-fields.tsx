"use client"

// The contact form shared by the Add client panel's Add Contact step and a client's Edit contact dialog.
import type { ReactNode } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { z } from "zod"

import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_COUNTRY } from "@/domain/countries"
import {
  CountryCountyFields,
  optionalEmail,
  SelectField,
  TextField,
  type AddressParts,
} from "@/staff/features/clients/client-form-fields"

// The same choices DocuSoft's own contact form offers (docusoftpractice account/add_client.html).
export const SALUTATIONS = ["Mr", "Mrs", "Miss", "Ms", "Dr", "Hr", "N/A"]
export const ROLES = ["Viwer", "Approver", "Owner", "Facilitator", "director"] // spelt as DocuSoft stores them

export const contactSchema = z.object({
  salutation: z.string(),
  firstName: z.string().trim().min(1, "Enter the first name").max(100, "At most 100 characters"),
  lastName: z.string().trim().min(1, "Enter the last name").max(100, "At most 100 characters"),
  greeting: z.string().trim(),
  email: z.string().trim().min(1, "Enter the contact's email").pipe(optionalEmail),
  tel: z.string().trim(),
  mobile: z.string().trim(),
  role: z.string(),
  managerId: z.string(),
  add1: z.string().trim(),
  add2: z.string().trim(),
  add3: z.string().trim(),
  town: z.string().trim(),
  county: z.string().trim(),
  postcode: z.string().trim(),
  country: z.string().trim(),
  note: z.string().trim(),
  active: z.boolean(),
  mainContact: z.boolean(),
})
export type ContactValues = z.infer<typeof contactSchema>

export const ADDRESS_KEYS = ["add1", "add2", "add3", "town", "county", "postcode", "country"]

/** A blank contact — its address auto-filled from the client's main address (United Kingdom when there is none). */
export const emptyContact = (mainContact: boolean, address?: AddressParts): ContactValues => ({
  salutation: "",
  firstName: "",
  lastName: "",
  greeting: "",
  email: "",
  tel: "",
  mobile: "",
  role: "",
  managerId: "",
  add1: address?.add1 ?? "",
  add2: address?.add2 ?? "",
  add3: address?.add3 ?? "",
  town: address?.town ?? "",
  county: address?.county ?? "",
  postcode: address?.postcode ?? "",
  country: address?.country || DEFAULT_COUNTRY,
  note: "",
  active: true,
  mainContact,
})

/** The contact's fields (details, then address and note — or Edit contact's order, see `grouped`) — the surrounding form, buttons and saving are the caller's. */
export function ContactFields({
  form,
  idPrefix,
  heading,
  users,
  usersLoading,
  addressNote,
  grouped,
}: {
  form: UseFormReturn<ContactValues>
  idPrefix: string
  heading: string
  users: { value: string; label: string }[]
  usersLoading?: boolean
  addressNote?: string
  /**
   * Edit contact's layout: Main contact / Active in one box together with `grouped.extra` (e.g. the warehouse
   * permissions), then Note, then Address last. Without it: details (with the two ticks), then address and note.
   */
  grouped?: {
    extra?: ReactNode
    /** shows only this part (Edit contact's tabs); the rest stays mounted, hidden */ show?: "details" | "address"
  }
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form
  const [country, county] = useWatch({ control, name: ["country", "county"] })
  const id = (name: string) => `${idPrefix}-${name}`

  // Edit contact (grouped): toggle switches; Add contact: plain ticks
  const flags = grouped ? (
    <div className="flex flex-wrap gap-6 text-sm">
      {(
        [
          ["mainContact", "Main contact"],
          ["active", "Active"],
        ] as const
      ).map(([name, label]) => (
        <Controller
          key={name}
          name={name}
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2">
              <Switch checked={field.value} onCheckedChange={(on) => field.onChange(on)} />
              {label}
            </label>
          )}
        />
      ))}
    </div>
  ) : (
    <div className="flex flex-wrap gap-6 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" {...register("mainContact")} />
        Main contact
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" {...register("active")} />
        Active
      </label>
    </div>
  )
  const note = (
    <Field>
      <FieldLabel htmlFor={id("note")}>Note</FieldLabel>
      <Textarea id={id("note")} rows={2} {...register("note")} />
    </Field>
  )

  return (
    <>
      <div hidden={grouped?.show === "address"} className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">{heading}</h3>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
            <SelectField
              id={id("title")}
              label="Title"
              name="salutation"
              control={control}
              options={SALUTATIONS.map((s) => ({ value: s, label: s }))}
            />
            <TextField
              id={id("first")}
              label="First name"
              name="firstName"
              register={register}
              error={errors.firstName}
              required
            />
            <TextField
              id={id("last")}
              label="Last name"
              name="lastName"
              register={register}
              error={errors.lastName}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("email")}
              label="Email"
              name="email"
              type="email"
              register={register}
              error={errors.email}
              required
            />
            <TextField id={id("greeting")} label="Greeting" name="greeting" register={register} />
            <TextField id={id("tel")} label="Telephone" name="tel" type="tel" register={register} />
            <TextField id={id("mobile")} label="Mobile" name="mobile" type="tel" register={register} />
            <SelectField
              id={id("role")}
              label="Role"
              name="role"
              control={control}
              options={ROLES.map((r) => ({ value: r, label: r }))}
            />
            {usersLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <SelectField id={id("manager")} label="Manager" name="managerId" control={control} options={users} />
            )}
          </div>
          {!grouped && flags}
        </section>

        {grouped && (
          <section className="bg-muted/30 space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Contact status</h3>
              {flags}
            </div>
            {grouped.extra && <div className="border-t pt-4">{grouped.extra}</div>}
          </section>
        )}
        {grouped && note}
      </div>

      <section hidden={grouped?.show === "details"} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Address</h3>
          {addressNote && <p className="text-muted-foreground text-xs">{addressNote}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id={id("a1")} label="Line 1" name="add1" register={register} />
          <TextField id={id("a2")} label="Line 2" name="add2" register={register} />
          <TextField id={id("a3")} label="Line 3" name="add3" register={register} />
          <TextField id={id("town")} label="Town" name="town" register={register} />
          <TextField id={id("pc")} label="Postcode" name="postcode" register={register} />
          <CountryCountyFields
            idPrefix={idPrefix}
            country={country}
            county={county}
            onCountry={(val) => setValue("country", val, { shouldDirty: true })}
            onCounty={(val) => setValue("county", val, { shouldDirty: true })}
          />
        </div>
        {!grouped && note}
      </section>
    </>
  )
}
