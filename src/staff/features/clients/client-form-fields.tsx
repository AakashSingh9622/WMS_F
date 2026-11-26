"use client"

// Form pieces shared by the top bar's Add client panel and a client's Edit client dialog.
import { Controller, type Control, type FieldPath, type UseFormRegister } from "react-hook-form"
import { z } from "zod"

import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { flagUrl } from "@/domain/countries"
import { useCountries } from "@/hooks/useCountries"

/** One address, in DocuSoft's parts (Json_SetClientAddress). */
export interface AddressParts {
  add1: string
  add2: string
  add3: string
  town: string
  county: string
  postcode: string
  country: string
}

/** The one-line "Address" Json_AddClient / Json_UpdateClient keep, built from the address parts (as DocuSoft's page does). */
export const fullAddress = (a: AddressParts) =>
  [a.add1, a.add2, a.add3, a.town, a.county, a.postcode, a.country].filter(Boolean).join("\n")

/** Whether anything besides the country (which starts filled in) was given. */
export const hasAddress = (a: AddressParts) => [a.add1, a.add2, a.add3, a.town, a.county, a.postcode].some(Boolean)

export const errorText = (err: unknown) =>
  typeof err === "object" && err !== null && "message" in err
    ? String((err as { message: unknown }).message)
    : "That didn't work — please try again"

export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email")

/** DocuSoft's OrgActive values. */
export const ACTIVE_LABEL = { Yes: "Active", No: "Inactive", HID: "Hidden" } as const

/**
 * County and Country, as DocuSoft's own page has them: Country is a list with flags (United Kingdom to start with) and
 * County offers that country's counties / states — or a text box for a country DocuSoft has none for. Changing the
 * country clears a county that isn't one of the new country's.
 */
export function CountryCountyFields({
  idPrefix,
  country,
  county,
  onCountry,
  onCounty,
}: {
  idPrefix: string
  country: string
  county: string
  onCountry: (value: string) => void
  onCounty: (value: string) => void
}) {
  const countries = useCountries()
  const states = countries?.find((c) => c.name === country)?.states ?? []
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-county`}>County / State</FieldLabel>
        {!countries ? (
          <Skeleton className="h-8 w-full" />
        ) : states.length > 0 ? (
          <Select value={county} onValueChange={(v) => onCounty(v ?? "")}>
            <SelectTrigger id={`${idPrefix}-county`}>
              <SelectValue placeholder="---Select---" />
            </SelectTrigger>
            <SelectContent>
              {/* a county kept from a draft / saved earlier that isn't in the list still shows */}
              {county && !states.includes(county) && <SelectItem value={county}>{county}</SelectItem>}
              {states.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={`${idPrefix}-county`} value={county} onChange={(e) => onCounty(e.target.value)} />
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-country`}>Country</FieldLabel>
        {!countries ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Select
            value={country}
            onValueChange={(v) => {
              const next = v ?? ""
              onCountry(next)
              const nextStates = countries.find((c) => c.name === next)?.states ?? []
              if (county && nextStates.length > 0 && !nextStates.includes(county)) onCounty("")
            }}
          >
            <SelectTrigger id={`${idPrefix}-country`}>
              <SelectValue placeholder="Select a country" />
            </SelectTrigger>
            <SelectContent>
              {/* a country saved in DocuSoft under another spelling still shows */}
              {country && !countries.some((c) => c.name === country) && (
                <SelectItem value={country}>{country}</SelectItem>
              )}
              {countries.map((c) => (
                <SelectItem
                  key={c.code}
                  value={c.name}
                  icon={
                    // eslint-disable-next-line @next/next/no-img-element -- a tiny remote flag, as DocuSoft shows
                    <img
                      src={flagUrl(c.code)}
                      alt=""
                      loading="lazy"
                      className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover"
                    />
                  }
                >
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </>
  )
}

/** A text input wired to react-hook-form, with its label and error. */
export function TextField<T extends Record<string, unknown>>({
  id,
  label,
  name,
  register,
  error,
  type = "text",
  required,
  disabled,
  className,
}: {
  id: string
  label: string
  name: FieldPath<T>
  register: UseFormRegister<T>
  error?: { message?: string }
  type?: string
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <Field className={className} data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <Input id={id} type={type} disabled={disabled} aria-invalid={!!error || undefined} {...register(name)} />
      <FieldError errors={[error]} />
    </Field>
  )
}

/** A dropdown wired to react-hook-form ("" = nothing chosen). */
export function SelectField<T extends Record<string, unknown>>({
  id,
  label,
  name,
  control,
  options,
  placeholder = "Choose…",
  required,
}: {
  id: string
  label: string
  name: FieldPath<T>
  control: Control<T>
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={!!fieldState.error || undefined}>
          <FieldLabel htmlFor={id}>
            {label}
            {required && <span className="text-destructive">*</span>}
          </FieldLabel>
          <Select value={String(field.value ?? "")} onValueChange={(v) => field.onChange(v ?? "")}>
            <SelectTrigger id={id} aria-invalid={!!fieldState.error || undefined}>
              <SelectValue placeholder={placeholder} getLabel={(v) => options.find((o) => o.value === v)?.label ?? v} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
