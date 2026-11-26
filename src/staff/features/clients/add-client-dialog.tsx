"use client"

import { useEffect, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { useCan } from "@/auth/useAuth"
import { Check, User, Users } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { DEFAULT_COUNTRY } from "@/domain/countries"
import {
  ACTIVE_LABEL,
  CountryCountyFields,
  errorText,
  optionalEmail,
  SelectField,
  TextField,
  type AddressParts,
} from "@/staff/features/clients/client-form-fields"
import {
  ADDRESS_KEYS,
  ContactFields,
  contactSchema,
  emptyContact,
  type ContactValues,
} from "@/staff/features/clients/contact-form-fields"
import { RateCardForm } from "@/staff/features/billing/rate-cards-screen"
import { ReferenceFieldsEditor } from "@/staff/features/settings/docusoft-reference-fields"
import { NewContactUdfFields } from "@/staff/features/clients/udf-values"
import { PERMISSION_UDFS } from "@/staff/features/clients/contact-permission-udfs"
import { useSetContactPermission } from "@/api/clientProfile"
import { ClientDeliveryNoteColumns } from "@/staff/features/clients/client-profile-card"
import { getDocusoftCredentials, getStoredProjectId } from "@/store/docusoftCreds"
import {
  useAddClientMutation,
  useGetConfigurationQuery,
  useGetFoldersQuery,
  useCreatePortalUserMutation,
  useInsertContactMutation,
  useSetClientAddressMutation,
  useUpdateContactFieldMutation,
} from "@/store/docusoftApi"

// The five steps of the panel — exactly these, in this order.
const TABS = [
  { key: "client", label: "Add Client" },
  { key: "contact", label: "Add Contact" },
  { key: "udf", label: "Expedientes" },
  { key: "rates", label: "New Rate Card" },
  { key: "delivery", label: "Delivery Note" },
] as const
type TabKey = (typeof TABS)[number]["key"]

/** The client the five steps work on — set once Add Client has saved it in DocuSoft. */
interface CreatedClient {
  id: string
  name: string
  folderIds: number[]
  /** Its main address as typed in Add Client — new contacts start with it (auto-filled, still editable). */
  address?: AddressParts
}

// --- Draft: what is typed in the panel is kept in this browser (per DocuSoft user) until it is saved or discarded, so
// closing the panel, reloading or signing back in doesn't lose it. Only a convenience: everything works without it.
interface Draft {
  client?: Partial<ClientValues> // the Add Client form, until the client is added
  contact?: Partial<ContactValues> // the Add Contact form, until that contact is added
  contactsAdded?: AddedContact[] // contacts already added to that client from this panel
  created?: CreatedClient | null // the client the steps work on
  tab?: TabKey
  savedAt?: string
}

function draftKey() {
  const creds = getDocusoftCredentials()
  return creds ? `wms_add_client_draft:${creds.agrno}:${creds.Email.toLowerCase()}` : null
}

function readDraft(): Draft {
  try {
    const key = draftKey()
    const raw = key ? localStorage.getItem(key) : null
    return raw ? (JSON.parse(raw) as Draft) : {}
  } catch {
    return {}
  }
}

function writeDraft(patch: Partial<Draft>) {
  try {
    const key = draftKey()
    if (key) localStorage.setItem(key, JSON.stringify({ ...readDraft(), ...patch, savedAt: new Date().toISOString() }))
  } catch {
    // storage blocked or full — the panel still works, just without a draft
  }
}

function clearDraft() {
  try {
    const key = draftKey()
    if (key) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** True when a form draft has anything typed in it (so a "draft restored" note is worth showing). */
// (fields that start pre-filled — the ticked folder, Active, United Kingdom, an auto-filled address — don't count)
const hasContent = (values?: Record<string, unknown>, prefilled: string[] = []) =>
  !!values &&
  Object.entries(values).some(
    ([k, v]) =>
      !["folderIds", "active", "mainContact", "country", ...prefilled].includes(k) &&
      typeof v === "string" &&
      v.trim() !== "",
  )

/** "Draft restored" note with a Discard button, shown above a form that came back from a draft. */
function DraftNote({ savedAt, onDiscard }: { savedAt?: string; onDiscard: () => void }) {
  return (
    <div className="bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-xs">
      <span>
        Draft restored
        {savedAt ? ` — last saved ${new Date(savedAt).toLocaleString()}` : ""}.
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
        Discard draft
      </Button>
    </div>
  )
}

interface AddedContact {
  no: string
  name: string
  email: string
  main: boolean
}

// ---------------------------------------------------------------------------------------------------------------
// Tab 1 — Add Client: Json_AddClient, then the main address (Json_SetClientAddress, AddressId 1).

const clientSchema = z.object({
  clientId: z.string().trim().min(1, "Enter the client reference").max(50, "At most 50 characters"),
  name: z.string().trim().min(1, "Enter the client name").max(200, "At most 200 characters"),
  folderIds: z.array(z.number()).min(1, "Tick at least one folder"),
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
})
type ClientValues = z.infer<typeof clientSchema>

const emptyClient = (): ClientValues => {
  const homeFolder = Number(getStoredProjectId())
  return {
    clientId: "",
    name: "",
    // the signed-in user's own folder ticked to start with (DocuSoft's page falls back to it too)
    folderIds: Number.isFinite(homeFolder) && homeFolder > 0 ? [homeFolder] : [],
    managerId: "",
    statusId: "",
    businessId: "",
    sourceId: "",
    active: "Yes",
    email: "",
    tel: "",
    altTel: "",
    add1: "",
    add2: "",
    add3: "",
    town: "",
    county: "",
    postcode: "",
    country: DEFAULT_COUNTRY,
    description: "",
  }
}

function AddClientTab({
  created,
  onCreated,
}: {
  created: CreatedClient | null
  onCreated: (c: CreatedClient) => void
}) {
  const folders = useGetFoldersQuery()
  const config = useGetConfigurationQuery()
  const [addClient] = useAddClientMutation()
  const [setAddress] = useSetClientAddressMutation()
  const [formError, setFormError] = useState<string | null>(null)
  // read once when the step mounts (the panel is open, so this runs in the browser)
  const [draft] = useState(readDraft)
  const [restored, setRestored] = useState(() => hasContent(draft.client))

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    subscribe,
    formState: { errors, isSubmitting },
  } = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { ...emptyClient(), ...draft.client },
  })

  const [country, county] = useWatch({ control, name: ["country", "county"] })

  // keep the draft up to date as the user types
  useEffect(() => {
    return subscribe({ formState: { values: true }, callback: ({ values }) => writeDraft({ client: values }) })
  }, [subscribe])

  const saveDraft = () => {
    writeDraft({ client: getValues() })
    toast.success("Draft saved — it will be here when you come back")
  }
  const discardDraft = () => {
    reset(emptyClient())
    writeDraft({ client: undefined })
    setRestored(false)
    setFormError(null)
  }

  const onSubmit = async (v: ClientValues) => {
    setFormError(null)
    // Country starts filled in (United Kingdom), so on its own it isn't an address worth saving.
    const hasAddress = [v.add1, v.add2, v.add3, v.town, v.county, v.postcode].some(Boolean)
    const lines = hasAddress ? [v.add1, v.add2, v.add3, v.town, v.county, v.postcode, v.country].filter(Boolean) : []
    try {
      await addClient({
        clientId: v.clientId,
        name: v.name,
        folderIds: v.folderIds,
        email: v.email,
        tel: v.tel,
        altTel: v.altTel,
        address: lines.join("\n"),
        statusId: v.statusId,
        businessId: v.businessId,
        sourceId: v.sourceId,
        managerId: v.managerId,
        description: v.description,
        active: v.active,
      }).unwrap()
    } catch (err) {
      setFormError(errorText(err))
      return
    }
    // The client exists now; the address is a second call, so a failure there must not hide that.
    if (lines.length > 0) {
      try {
        await setAddress({ ...v, addressId: 1 }).unwrap()
      } catch (err) {
        toast.warning(`Client added, but its address wasn't saved: ${errorText(err)}`)
      }
    }
    toast.success(`${v.name} added in DocuSoft`)
    writeDraft({ client: undefined }) // saved for real — nothing left to keep
    const { add1, add2, add3, town, county, postcode, country } = v
    onCreated({
      id: v.clientId,
      name: v.name,
      folderIds: v.folderIds,
      address: { add1, add2, add3, town, county, postcode, country },
    })
  }

  if (created) {
    return (
      <div className="space-y-2 rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <p className="font-medium">
          {created.name} ({created.id}) was added in DocuSoft.
        </p>
        <p>Carry on with its contacts, expedientes, rate card and delivery note from the list on the left.</p>
      </div>
    )
  }

  const users = (config.data?.users ?? []).map((u) => ({
    value: String(u.UserId),
    label: u.UserName,
  }))
  const statuses = (config.data?.statuses ?? []).map((s) => ({
    value: String(s.StatusId),
    label: s.StatusName,
  }))
  const businesses = (config.data?.businesses ?? []).map((b) => ({
    value: String(b.BussId),
    label: b.BussName,
  }))
  const sources = (config.data?.sources ?? []).map((s) => ({
    value: String(s.SourceId),
    label: s.SourceName,
  }))

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {restored && <DraftNote savedAt={draft.savedAt} onDiscard={discardDraft} />}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Company details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="ac-id"
            label="Client reference"
            name="clientId"
            register={register}
            error={errors.clientId}
            required
          />
          <TextField id="ac-name" label="Client name" name="name" register={register} error={errors.name} required />
        </div>
        {config.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : config.isError ? (
          <p className="text-destructive text-sm">
            DocuSoft&apos;s lists couldn&apos;t be loaded: {errorText(config.error)}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField id="ac-manager" label="Manager" name="managerId" control={control} options={users} required />
            <SelectField id="ac-status" label="Status" name="statusId" control={control} options={statuses} />
            <SelectField
              id="ac-business"
              label="Business type"
              name="businessId"
              control={control}
              options={businesses}
            />
            <SelectField id="ac-source" label="Source" name="sourceId" control={control} options={sources} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="ac-email"
            label="Company email"
            name="email"
            type="email"
            register={register}
            error={errors.email}
          />
          <TextField id="ac-tel" label="Telephone" name="tel" type="tel" register={register} error={errors.tel} />
          <TextField
            id="ac-alt"
            label="Other telephone"
            name="altTel"
            type="tel"
            register={register}
            error={errors.altTel}
          />
        </div>
        <SelectField
          id="ac-active"
          label="State"
          name="active"
          control={control}
          options={(Object.keys(ACTIVE_LABEL) as (keyof typeof ACTIVE_LABEL)[]).map((k) => ({
            value: k,
            label: ACTIVE_LABEL[k],
          }))}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Folders<span className="text-destructive">*</span>
        </h3>
        <p className="text-muted-foreground text-xs">The DocuSoft folders this client goes in.</p>
        {folders.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <Controller
            control={control}
            name="folderIds"
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                  {folders.data?.map((f) => (
                    <label
                      key={f.FolderID}
                      className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={field.value.includes(f.FolderID)}
                        onChange={(e) =>
                          field.onChange(
                            e.target.checked
                              ? [...field.value, f.FolderID]
                              : field.value.filter((id) => id !== f.FolderID),
                          )
                        }
                      />
                      {f.Folder}
                    </label>
                  ))}
                </div>
                <FieldError errors={[fieldState.error]} />
              </div>
            )}
          />
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Main address</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="ac-a1" label="Line 1" name="add1" register={register} />
          <TextField id="ac-a2" label="Line 2" name="add2" register={register} />
          <TextField id="ac-a3" label="Line 3" name="add3" register={register} />
          <TextField id="ac-town" label="Town" name="town" register={register} />
          <TextField id="ac-pc" label="Postcode" name="postcode" register={register} />
          <CountryCountyFields
            idPrefix="ac"
            country={country}
            county={county}
            onCountry={(val) => setValue("country", val, { shouldDirty: true })}
            onCounty={(val) => setValue("county", val, { shouldDirty: true })}
          />
        </div>
        <Field>
          <FieldLabel htmlFor="ac-desc">Description</FieldLabel>
          <Textarea id="ac-desc" rows={2} {...register("description")} />
        </Field>
      </section>

      {formError && <p className="text-destructive rounded-md border border-current/30 p-3 text-sm">{formError}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={saveDraft} disabled={isSubmitting}>
          Save draft
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Adding client…" : "Add client"}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Tab 3 — Expedientes (DocuSoft's reference UDFs): the same editor as Settings → Custom fields, for the new client in one of its folders.

function ReferenceUdfTab({ client }: { client: CreatedClient }) {
  const folders = useGetFoldersQuery()
  const [projectId, setProjectId] = useState(client.folderIds[0])
  const folderName = (id: number) => folders.data?.find((f) => f.FolderID === id)?.Folder ?? String(id)
  return (
    <div className="space-y-4">
      <Field className="max-w-xs">
        <FieldLabel htmlFor="ac-udf-folder">Folder</FieldLabel>
        <Select value={String(projectId)} onValueChange={(v) => v && setProjectId(Number(v))}>
          <SelectTrigger id="ac-udf-folder">
            <SelectValue getLabel={(v) => folderName(Number(v))} />
          </SelectTrigger>
          <SelectContent>
            {client.folderIds.map((id) => (
              <SelectItem key={id} value={String(id)}>
                {folderName(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ReferenceFieldsEditor key={projectId} clientId={client.id} projectId={projectId} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Tab 2 — Add Contact: Json_InsertContact against the new client.

function AddContactTab({ client }: { client: CreatedClient }) {
  const config = useGetConfigurationQuery()
  const [insertContact] = useInsertContactMutation()
  const [createPortalUser] = useCreatePortalUserMutation()
  const setPermission = useSetContactPermission(client.id)
  const [updateContactField] = useUpdateContactFieldMutation()
  const [draft] = useState(readDraft)
  const [restored, setRestored] = useState(() => hasContent(draft.contact, ADDRESS_KEYS))
  const [added, setAddedState] = useState<AddedContact[]>(() => draft.contactsAdded ?? [])
  const setAdded = (next: AddedContact[]) => {
    setAddedState(next)
    writeDraft({ contactsAdded: next })
  }
  const [formError, setFormError] = useState<string | null>(null)
  // The contact UDFs filled in with the form (field name → value as DocuSoft takes it), saved once the contact is added.
  const [udfValues, setUdfValues] = useState<Record<string, string>>({})
  const [udfKey, setUdfKey] = useState(0) // bumps for a fresh, empty set of UDFs after each contact
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    // the first contact starts as the main contact; the address starts as the client's
    defaultValues: { ...emptyContact(added.length === 0, client.address), ...draft.contact },
  })
  const {
    handleSubmit,
    reset,
    getValues,
    subscribe,
    formState: { isSubmitting },
  } = form

  useEffect(() => {
    return subscribe({ formState: { values: true }, callback: ({ values }) => writeDraft({ contact: values }) })
  }, [subscribe])

  const saveDraft = () => {
    writeDraft({ contact: getValues() })
    toast.success("Draft saved — it will be here when you come back")
  }
  const discardDraft = () => {
    reset(emptyContact(added.length === 0, client.address))
    writeDraft({ contact: undefined })
    setRestored(false)
    setFormError(null)
  }

  const users = (config.data?.users ?? []).map((u) => ({
    value: String(u.UserId),
    label: u.UserName,
  }))

  const onSubmit = async (v: ContactValues) => {
    setFormError(null)
    if (added.some((c) => c.email.toLowerCase() === v.email.toLowerCase())) {
      setFormError(`${v.email} was already added to this client`)
      return
    }
    try {
      const no = await insertContact({
        ...v,
        clientId: client.id,
        managerName: users.find((u) => u.value === v.managerId)?.label ?? "",
      }).unwrap()
      setAdded([...added, { no, name: `${v.firstName} ${v.lastName}`, email: v.email, main: v.mainContact }])
      toast.success(`${v.firstName} ${v.lastName} added as a contact of ${client.name}`)
      // then its portal account (PortalUserAccountCreated_Json), as DocuSoft's contact page does after adding one
      try {
        await createPortalUser({ clientId: client.id, clientName: client.name, contactEmail: v.email }).unwrap()
        toast.success(`Portal account created for ${v.email}`)
      } catch (err) {
        toast.warning(`Contact added, but its portal account wasn't created: ${errorText(err)}`)
      }
      // Json_InsertContact has no county: DocuSoft's own page saves it ("State") on the new contact straight after.
      if (v.county && no) {
        try {
          await updateContactField({
            clientId: client.id,
            projectId: client.folderIds[0],
            contactNo: no,
            fieldName: "State",
            fieldValue: v.county,
          }).unwrap()
        } catch (err) {
          toast.warning(`Contact added, but its county wasn't saved: ${errorText(err)}`)
        }
      }
      // then its UDFs, one field at a time (Json_UpdateContactField) — as Edit contact → UDF Details saves them
      const udfs = Object.entries(udfValues)
      if (no && udfs.length > 0) {
        const failed: string[] = []
        for (const [fieldName, fieldValue] of udfs) {
          try {
            await updateContactField({
              clientId: client.id,
              projectId: client.folderIds[0],
              contactNo: no,
              fieldName,
              fieldValue,
            }).unwrap()
          } catch {
            failed.push(fieldName)
          }
        }
        if (failed.length) toast.warning(`Contact added, but these UDFs weren't saved: ${failed.join(", ")}`)
        // May borrow / May destroy are two of these UDFs — copy them to our row too, which the portal checks
        const flag = (name: string) => {
          const hit = udfs.find(([n]) => n.toLowerCase() === name.toLowerCase() && !failed.includes(n))
          return hit ? hit[1] === "1" : undefined
        }
        const perms = { canLoan: flag(PERMISSION_UDFS.canLoan), canPurge: flag(PERMISSION_UDFS.canPurge) }
        if (perms.canLoan !== undefined || perms.canPurge !== undefined) {
          try {
            await setPermission.mutateAsync({ email: v.email, ...perms })
          } catch (err) {
            toast.warning(`Contact added, but the portal's copy of its permissions wasn't saved: ${errorText(err)}`)
          }
        }
      }
      setUdfValues({})
      setUdfKey((k) => k + 1)
      reset(emptyContact(false, client.address)) // ready for the next contact
      writeDraft({ contact: undefined })
      setRestored(false)
    } catch (err) {
      setFormError(errorText(err))
    }
  }

  return (
    <div className="space-y-6">
      {added.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Added to {client.name}</p>
          <ul className="divide-y rounded-lg border text-sm">
            {added.map((c) => (
              <li key={c.no || c.email} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Check className="size-4 text-emerald-600" aria-hidden />
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">{c.email}</span>
                {c.main && <Badge variant="secondary">Main contact</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {restored && <DraftNote savedAt={draft.savedAt} onDiscard={discardDraft} />}
        <ContactFields
          form={form}
          idPrefix="cc"
          heading={`Contact of ${client.name}`}
          users={users}
          usersLoading={config.isLoading}
          addressNote={
            client.address && [client.address.add1, client.address.town, client.address.postcode].some(Boolean)
              ? `Filled in from ${client.name}’s address — change it if needed.`
              : undefined
          }
        />

        {/* The contact UDFs, right under Note: filled in with the form, no question asked, saved after Add contact. */}
        <section className="border-t pt-4">
          <NewContactUdfFields
            key={udfKey}
            projectId={client.folderIds[0]}
            onChange={(name, value) => {
              setUdfValues((u) => {
                const next = { ...u }
                if (value === null) delete next[name]
                else next[name] = value
                return next
              })
            }}
          />
        </section>

        {formError && <p className="text-destructive rounded-md border border-current/30 p-3 text-sm">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={saveDraft} disabled={isSubmitting}>
            Save draft
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding contact…" : "Add contact"}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Tab 4 — New Rate Card: the Billing → Rate cards form, fixed to the new client.

function RateCardTab({ client }: { client: CreatedClient }) {
  const canManage = useCan("billing.manage")
  const [saved, setSaved] = useState(0) // bumps the form's key: a fresh form after each save
  if (!canManage) {
    return <p className="text-muted-foreground text-sm">Only users who manage billing can add a rate card.</p>
  }
  return (
    <div className="space-y-4">
      {saved > 0 && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Rate card saved for {client.name}. It shows in Billing → Rate cards.
        </p>
      )}
      <RateCardForm
        key={saved}
        forClient={{ id: client.id, name: client.name }}
        inline
        onSaved={() => setSaved((n) => n + 1)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

/** A step that needs the client to exist first. */
function NeedsClient({ onGo }: { onGo: () => void }) {
  return (
    <div className="text-muted-foreground space-y-3 rounded-lg border border-dashed p-6 text-center text-sm">
      <p>Add the client first — this step is saved against it.</p>
      <Button variant="outline" size="sm" onClick={onGo}>
        Go to Add Client
      </Button>
    </div>
  )
}

/**
 * The top bar's "Add client": a panel with a tree of five steps — Add Client, Add Contact, Expedientes, New Rate
 * Card, Delivery Note — all working on the same client. The client, its fields and contacts are saved straight in DocuSoft (never in
 * our database); the rate card goes to our billing like any other. Every step stays mounted while the panel is open, so
 * moving between them keeps what was typed.
 */
export function AddClientButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>("client")
  const [created, setCreated] = useState<CreatedClient | null>(null)
  const [session, setSession] = useState(0) // bumps to start a brand-new client

  // Where the user was (which client, which step) is part of the draft, so reopening carries on from there.
  const openPanel = () => {
    const draft = readDraft()
    setCreated(draft.created ?? null)
    setTab(draft.tab ?? "client")
    setOpen(true)
  }
  const goTo = (next: TabKey) => {
    setTab(next)
    writeDraft({ tab: next })
  }
  // Once the client is added, carry straight on to its contacts (any step can still be picked on the left).
  const onCreated = (client: CreatedClient) => {
    setCreated(client)
    setTab("contact")
    writeDraft({ created: client, tab: "contact" })
  }
  const startOver = () => {
    clearDraft()
    setCreated(null)
    setTab("client")
    setSession((s) => s + 1)
  }

  const panel = (key: TabKey) => {
    if (key === "client") return <AddClientTab created={created} onCreated={onCreated} />
    if (!created) return <NeedsClient onGo={() => goTo("client")} />
    if (key === "udf") return <ReferenceUdfTab client={created} />
    if (key === "contact") return <AddContactTab client={created} />
    if (key === "delivery") return <ClientDeliveryNoteColumns clientId={created.id} />
    return <RateCardTab client={created} />
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPanel} aria-label="Add a client">
        <Users className="size-4" aria-hidden />
        <span className="hidden sm:inline">Add client</span>
      </Button>
      {/* Closes only with the ✕ button: a click outside or Escape must not throw away a half-typed client. */}
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next, details) => {
          if (!next && details.reason === "escape-key") return
          setOpen(next)
        }}
      >
        <DialogContent className="max-h-[92svh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{created ? created.name : "Add a client"}</DialogTitle>
            <DialogDescription>
              Saved in DocuSoft. Add the client first, then its contacts, expedientes, rate card and delivery note.
            </DialogDescription>
          </DialogHeader>

          <div key={session} className="grid min-h-0 gap-4 md:grid-cols-[13rem_1fr]">
            {/* the tree: the client, with its five steps under it */}
            <nav aria-label="Add client steps" className="text-sm">
              <p className="flex items-center gap-2 px-2 py-1 font-medium">
                <User className="size-4" aria-hidden />
                <span className="truncate">{created ? created.name : "New client"}</span>
              </p>
              <ul className="ml-4 flex gap-1 overflow-x-auto border-l pl-2 md:block md:space-y-1" role="tablist">
                {TABS.map((t, i) => {
                  const done = t.key === "client" && !!created
                  const locked = t.key !== "client" && !created
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        role="tab"
                        id={`ac-tab-${t.key}`}
                        aria-selected={tab === t.key}
                        aria-controls={`ac-panel-${t.key}`}
                        onClick={() => goTo(t.key)}
                        className={cn(
                          "hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left whitespace-nowrap",
                          tab === t.key && "bg-primary/10 text-primary font-medium",
                          locked && "text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full border text-[11px]",
                            done && "border-emerald-600 bg-emerald-600 text-white",
                          )}
                        >
                          {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                        </span>
                        {t.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {created && (
                <Button variant="ghost" size="sm" className="mt-3 w-full justify-start" onClick={startOver}>
                  Add another client
                </Button>
              )}
            </nav>

            {/* every step stays mounted (hidden when not shown) so what was typed survives switching */}
            <div className="max-h-[70svh] min-w-0 overflow-y-auto pr-1">
              {TABS.map((t) => (
                <div
                  key={t.key}
                  role="tabpanel"
                  id={`ac-panel-${t.key}`}
                  aria-labelledby={`ac-tab-${t.key}`}
                  hidden={tab !== t.key}
                >
                  {panel(t.key)}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
