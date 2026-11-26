"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useContactPermissions, useSetContactPermission } from "@/api/clientProfile"
import { useCan } from "@/auth/useAuth"
import { Pencil } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DEFAULT_COUNTRY } from "@/domain/countries"
import { useClientCard } from "@/hooks/useClientCard"
import { cn } from "@/lib/utils"
import { errorText } from "@/staff/features/clients/client-form-fields"
import { ContactUdfValues } from "@/staff/features/clients/udf-values"
import { ContactPortal } from "@/staff/features/clients/contact-portal"
import {
  PERMISSION_UDFS,
  useContactPermissionUdfs,
  useSaveContactPermissionUdfs,
} from "@/staff/features/clients/contact-permission-udfs"
import { ContactFields, contactSchema, type ContactValues } from "@/staff/features/clients/contact-form-fields"
import {
  useGetClientContactsQuery,
  useGetConfigurationQuery,
  useUpdateContactFieldMutation,
  useUpdateContactMutation,
  type DocusoftContact,
} from "@/store/docusoftApi"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
// DocuSoft sends flags as true / "Yes" / "True" / 1 … depending on the call
const yes = (v: unknown) => v === true || v === 1 || ["yes", "y", "true", "1"].includes(s(v).toLowerCase())
const no = (v: unknown) => v === false || v === 0 || ["no", "n", "false", "0"].includes(s(v).toLowerCase())

/**
 * The form's starting values from DocuSoft's full contact row (Json_GetAllContactsByClientID's column names), with the
 * row the Contacts tab already shows (the client card's) filling any gap — so the form says what the list says.
 */
function toValues(c: DocusoftContact, listed?: DocusoftContact): ContactValues {
  const pick = (key: string) => s(c[key]) || s(listed?.[key])
  return {
    salutation: s(c["Title"] ?? c["Salutation"]),
    firstName: pick("First Name"),
    lastName: pick("Last Name"),
    greeting: s(c["Greeting"]),
    email: pick("E-Mail"),
    tel: s(c["Tel"]),
    mobile: s(c["Mobile"]),
    role: s(c["Role"]),
    managerId: s(c["Assigned Manager"]) === "0" ? "" : s(c["Assigned Manager"]),
    add1: s(c["Address 1"]),
    add2: s(c["Address 2"]),
    add3: s(c["Address 3"]),
    town: s(c["Town"]),
    county: s(c["County"]),
    postcode: s(c["Postcode"]),
    country: s(c["Country"]) || DEFAULT_COUNTRY,
    note: s(c["Note"]),
    // Active unless DocuSoft says otherwise: an empty / missing value is an active contact (as DocuSoft's own page reads it)
    active: !no(c["Active"] ?? c["CActive"]),
    mainContact: yes(c["Main Contact"]) || yes(listed?.["Main Contact"]),
  }
}

function EditContactForm({
  clientId,
  projectId,
  contact,
  listed,
  show,
  onInvalid,
  onDone,
}: {
  clientId: string
  projectId: number
  contact: DocusoftContact
  listed?: DocusoftContact // the same contact as the Contacts tab shows it
  show: "details" | "address" // which tab of the form is open
  onInvalid: () => void // a required field is missing — they're all on Contact Details
  onDone: () => void
}) {
  const config = useGetConfigurationQuery()
  const [updateContact] = useUpdateContactMutation()
  const [updateField] = useUpdateContactFieldMutation()
  const { data: permissions } = useContactPermissions(clientId)
  const setPermission = useSetContactPermission(clientId)
  const canEditPermissions = useCan("settings.manage") // same rule as the ticks on the Contacts tab
  const [formError, setFormError] = useState<string | null>(null)
  const [initial] = useState(() => toValues(contact, listed))
  const contactNo = s(contact["ContactNo"])

  const form = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: initial })
  const {
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = form

  // May borrow / May destroy = the contact's DocuSoft UDFs "Loan Documents" / "Destroy Documents" (tag Permissions):
  // read from there, and saved there with the rest of the form (contact-permission-udfs.ts).
  const udfPerms = useContactPermissionUdfs({ clientId, projectId, contactNo, email: initial.email })
  const saveUdfPerms = useSaveContactPermissionUdfs(clientId)
  const savedFlags = { canLoan: udfPerms.canLoan, canPurge: udfPerms.canPurge }
  // our own row of the contact (the portal's copy, plus its portal files) — moved along when the email changes
  const saved = permissions?.find((p) => p.email === initial.email.toLowerCase())
  const [flags, setFlags] = useState<{ canLoan?: boolean; canPurge?: boolean }>({})
  const current = { canLoan: flags.canLoan ?? savedFlags.canLoan, canPurge: flags.canPurge ?? savedFlags.canPurge }
  const flagsChanged = current.canLoan !== savedFlags.canLoan || current.canPurge !== savedFlags.canPurge

  const users = (config.data?.users ?? []).map((u) => ({ value: s(u.UserId), label: u.UserName }))

  const onSubmit = async (v: ContactValues) => {
    setFormError(null)
    // Only the warehouse permissions changed → nothing to send to DocuSoft.
    if (isDirty) {
      try {
        await updateContact({
          ...v,
          clientId,
          managerName: users.find((u) => u.value === v.managerId)?.label ?? "",
          originalEmail: initial.email, // how DocuSoft finds the contact
        }).unwrap()
      } catch (err) {
        setFormError(errorText(err))
        return
      }
    }

    // The contact is updated; the rest are separate calls, so a failure there is a warning, not a lost save.
    const warnings: string[] = []
    // County isn't part of Json_UpdateContact — DocuSoft's page saves it ("State") straight after.
    if (v.county !== initial.county && contactNo) {
      try {
        await updateField({ clientId, projectId, contactNo, fieldName: "State", fieldValue: v.county }).unwrap()
      } catch (err) {
        warnings.push(`the county (${errorText(err)})`)
      }
    }
    // Our own row of the contact is kept by email: carried over to the new email when the email changed.
    const oldEmail = initial.email.toLowerCase()
    const newEmail = v.email.toLowerCase()
    if (newEmail !== oldEmail && saved) {
      try {
        await setPermission.mutateAsync({
          email: newEmail,
          canLoan: saved.canLoan,
          canPurge: saved.canPurge,
          expedienteIds: saved.expedienteIds,
        })
      } catch (err) {
        warnings.push(`its portal settings under the new email (${errorText(err)})`)
      }
    }
    // May borrow / May destroy: into the DocuSoft UDFs (then the portal's copy), only the ones changed here
    if (flagsChanged && contactNo) {
      try {
        await saveUdfPerms({
          projectId,
          contactNo,
          email: newEmail,
          flags: {
            ...(current.canLoan !== savedFlags.canLoan ? { canLoan: current.canLoan } : {}),
            ...(current.canPurge !== savedFlags.canPurge ? { canPurge: current.canPurge } : {}),
          },
        })
      } catch (err) {
        warnings.push(`May borrow / May destroy (${errorText(err)})`)
      }
    }

    if (warnings.length) toast.warning(`Contact updated, but these weren't saved: ${warnings.join(", ")}`)
    else toast.success(isDirty ? `${v.firstName} ${v.lastName} updated in DocuSoft` : "Permissions saved")
    onDone()
  }

  const email = useWatch({ control: form.control, name: "email" })
  const emailChanged = email.trim().toLowerCase() !== initial.email.toLowerCase()

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
      <ContactFields
        form={form}
        idPrefix="ect"
        heading="Contact details"
        users={users}
        usersLoading={config.isLoading}
        grouped={{
          show,
          extra: (
            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Warehouse permissions</h3>
              </div>
              {udfPerms.isLoading && <Skeleton className="h-6 w-56" />}
              {udfPerms.isError && <p className="text-destructive text-xs">{errorText(udfPerms.error)}</p>}
              {!udfPerms.isLoading && udfPerms.missing.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  This folder has no {udfPerms.missing.join(" / ")} field under the {PERMISSION_UDFS.tag} tag — add it
                  in Settings → Contact UDF.
                </p>
              )}
              <div className="flex flex-wrap gap-6 text-sm">
                {(
                  [
                    ["canLoan", "May borrow"],
                    ["canPurge", "May destroy"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <Switch
                      checked={current[key]}
                      disabled={
                        !canEditPermissions ||
                        isSubmitting ||
                        udfPerms.isLoading ||
                        udfPerms.isError ||
                        udfPerms.missing.includes(PERMISSION_UDFS[key])
                      }
                      onCheckedChange={(on) => setFlags((f) => ({ ...f, [key]: on }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {!canEditPermissions && (
                <p className="text-muted-foreground text-xs">Only people who manage settings can change these.</p>
              )}
            </div>
          ),
        }}
      />
      {emailChanged && initial.email && (
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The email changes from {initial.email}. This contact&apos;s portal settings move to the new email; orders
          already placed keep the old one.
        </p>
      )}
      {formError && <p className="text-destructive rounded-md border border-current/30 p-3 text-sm">{formError}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || (!isDirty && !flagsChanged)}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

/**
 * "Edit" on a contact in a client's Users tab: change the contact in DocuSoft (Json_UpdateContact) — never in our
 * database. The full contact is read from Json_GetAllContactsByClientID (the client card's list has fewer columns).
 * Closes only with ✕ or Cancel, so a click outside can't throw away the changes.
 */
export function EditContactButton({ clientId, contact }: { clientId: string; contact: DocusoftContact }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"details" | "address" | "udf">("details")
  const { projectId, name: clientName } = useClientCard(clientId)
  const contactNo = s(contact["ContactNo"])
  const setPermission = useSetContactPermission(clientId)
  const full = useGetClientContactsQuery({ clientId, projectId }, { skip: !open })
  // the full row of this contact; the card's own row if DocuSoft's list doesn't have it
  const row = full.data?.find((c) => s(c["ContactNo"]) === contactNo) ?? (full.isSuccess ? contact : undefined)
  const name = [s(contact["First Name"]), s(contact["Last Name"])].filter(Boolean).join(" ") || "contact"

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setTab("details")
          setOpen(true)
        }}
        aria-label={`Edit ${name}`}
      >
        <Pencil className="size-4" aria-hidden />
        Edit
      </Button>
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next, details) => {
          if (!next && details.reason === "escape-key") return
          setOpen(next)
        }}
      >
        {/* one fixed size, so switching tabs doesn't resize the dialog; the content scrolls inside it */}
        <DialogContent className="flex h-[min(92svh,52rem)] w-full flex-col overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {name}</DialogTitle>
            <DialogDescription className="sr-only">Saved in DocuSoft.</DialogDescription>
          </DialogHeader>
          {/* as DocuSoft's contact page: the details, and the contact's own UDFs */}
          <div role="tablist" aria-label="Contact" className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1 text-sm">
            {(
              [
                ["details", "Contact Details"],
                ["address", "Address"],
                ["udf", "UDF Details"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-md px-3 py-1",
                  tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {full.isError ? (
            <p className="text-destructive text-sm">The contact couldn&apos;t be loaded: {errorText(full.error)}</p>
          ) : !row || projectId === undefined ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              {/* Contact Details and Address are one form (one Save); it stays mounted, so typed changes survive a look
                  at the UDFs */}
              <div hidden={tab === "udf"} className="space-y-6">
                {/* as DocuSoft's contact page: create the contact's portal account, or open it to change the password */}
                {tab === "details" && (
                  <ContactPortal
                    clientId={clientId}
                    clientName={clientName ?? clientId}
                    contact={{ ...contact, ...row }}
                  />
                )}
                <EditContactForm
                  clientId={clientId}
                  projectId={projectId}
                  contact={row}
                  listed={contact}
                  show={tab === "address" ? "address" : "details"}
                  onInvalid={() => setTab("details")}
                  onDone={() => setOpen(false)}
                />
              </div>
              {tab === "udf" && (
                <ContactUdfValues
                  clientId={clientId}
                  projectId={projectId}
                  contactNo={contactNo}
                  onSaved={async (fieldName, value) => {
                    // Loan Documents / Destroy Documents = May borrow / May destroy: the portal checks our copy
                    const flag = (["canLoan", "canPurge"] as const).find(
                      (f) => PERMISSION_UDFS[f].toLowerCase() === fieldName.toLowerCase(),
                    )
                    const email = s(row["E-Mail"])
                    if (flag && email) await setPermission.mutateAsync({ email, [flag]: value === "1" })
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
