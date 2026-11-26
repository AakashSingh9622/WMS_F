"use client"

import Link from "next/link"
import { useState } from "react"

import { toast } from "sonner"

import { useContactPermissions, useSetContactPermission } from "@/api/clientProfile"
import { useCan } from "@/auth/useAuth"
import { useExpedientes } from "@/api/expedientes"
import { useClientCard } from "@/hooks/useClientCard"
import type { DocusoftContact } from "@/store/docusoftApi"
import { EditContactButton } from "@/staff/features/clients/edit-contact-dialog"
import {
  PERMISSION_UDFS,
  useContactPermissionUdfs,
  useSaveContactPermissionUdfs,
  type PermissionFlag,
} from "@/staff/features/clients/contact-permission-udfs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())

// DocuSoft has no fixed phone column name, so take the first contact field that looks like one.
function phoneOf(contact: DocusoftContact): string {
  const key = Object.keys(contact).find((k) => /tel|phone|mobile/i.test(k) && text(contact[k]))
  return key ? text(contact[key]) : ""
}

/**
 * A contact's May borrow / May destroy — its DocuSoft UDFs "Loan Documents" / "Destroy Documents" (tag Permissions),
 * read from DocuSoft and saved straight back there (then copied to our row, which the portal checks).
 */
function PermissionToggles({
  clientId,
  projectId,
  contact,
  canEdit,
}: {
  clientId: string
  projectId?: number
  contact: DocusoftContact
  canEdit: boolean
}) {
  const contactNo = text(contact["ContactNo"])
  const email = text(contact["E-Mail"])
  const perms = useContactPermissionUdfs({ clientId, projectId, contactNo, email })
  const save = useSaveContactPermissionUdfs(clientId)
  const [saving, setSaving] = useState(false)
  if (!contactNo) return null
  if (perms.isLoading) return <Skeleton className="h-4 w-40" />
  if (perms.isError) return <p className="text-destructive text-xs">Couldn&apos;t read its permissions</p>

  const toggle = async (flag: PermissionFlag, on: boolean) => {
    if (projectId === undefined) return
    setSaving(true)
    try {
      await save({ projectId, contactNo, email, flags: { [flag]: on } })
      toast.success(`${PERMISSION_UDFS[flag]} ${on ? "on" : "off"}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      {(["canLoan", "canPurge"] as const).map((flag) => {
        const missing = perms.missing.includes(PERMISSION_UDFS[flag])
        return (
          <label
            key={flag}
            className="flex items-center gap-1.5"
            title={
              missing
                ? `No "${PERMISSION_UDFS[flag]}" UDF under the ${PERMISSION_UDFS.tag} tag in this folder`
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={perms[flag]}
              disabled={!canEdit || saving || missing}
              onChange={(e) => void toggle(flag, e.target.checked)}
            />
            {flag === "canLoan" ? "May borrow" : "May destroy"}
          </label>
        )
      })}
    </div>
  )
}

// "Contacts" tab = all the contacts DocuSoft holds for this client (Table6 of the client card).
export function ClientUsersTab({ clientId }: { clientId: string }) {
  const { contacts, needsFolder, isLoading, isError, projectId } = useClientCard(clientId)
  const { data: permissions } = useContactPermissions(clientId)
  const setPermission = useSetContactPermission(clientId)
  const { data: expedientes = [] } = useExpedientes(clientId)
  const canEdit = useCan("settings.manage")

  if (needsFolder) {
    return (
      <p className="text-muted-foreground max-w-xl text-sm">
        DocuSoft needs the folder this client is in. Open the client from the{" "}
        <Link href="/app/clients" className="text-primary hover:underline">
          Clients list
        </Link>{" "}
        after choosing its folder.
      </p>
    )
  }
  if (isLoading) return <Skeleton className="h-24 w-full max-w-xl" />
  if (isError) return <p className="text-destructive text-sm">Could not load the contacts from DocuSoft.</p>
  if (contacts.length === 0) {
    return <p className="text-muted-foreground text-sm">DocuSoft has no contacts for this client.</p>
  }

  return (
    <div className="max-w-xl space-y-2">
      <p className="text-muted-foreground text-xs tabular-nums">
        {contacts.length} contact{contacts.length === 1 ? "" : "s"}
      </p>
      {contacts.map((contact, i) => {
        const name = [text(contact["First Name"]), text(contact["Last Name"])].filter(Boolean).join(" ")
        const email = text(contact["E-Mail"])
        const phone = phoneOf(contact)
        return (
          <div
            key={text(contact["ContactNo"]) || i}
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{name || "Unnamed contact"}</p>
              {email && (
                <a href={`mailto:${email}`} className="text-primary block truncate hover:underline">
                  {email}
                </a>
              )}
              {phone && <p className="text-muted-foreground">{phone}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-1.5">
                {contact["Main Contact"] === true && <Badge variant="outline">Main contact</Badge>}
                {contact["Portal User"] === true && <Badge variant="outline">Portal user</Badge>}
                <EditContactButton clientId={clientId} contact={contact} />
              </div>
              {/* May borrow / May destroy = the contact's DocuSoft UDFs (Permissions tag) */}
              <PermissionToggles clientId={clientId} projectId={projectId} contact={contact} canEdit={canEdit} />
              {email && expedientes.length > 0 && (
                // Docbox "Permisos Web": which files this contact sees on the portal. None ticked = all of them.
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Portal files:</span>
                  {expedientes.map((e) => {
                    const given = permissions?.find((p) => p.email === email.toLowerCase())?.expedienteIds ?? []
                    const on = given.includes(e.id)
                    return (
                      <label key={e.id} className="flex items-center gap-1.5" title={e.description}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canEdit || setPermission.isPending}
                          onChange={(ev) =>
                            setPermission.mutate(
                              {
                                email,
                                expedienteIds: ev.target.checked ? [...given, e.id] : given.filter((id) => id !== e.id),
                              },
                              { onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save") },
                            )
                          }
                        />
                        {e.code}
                      </label>
                    )
                  })}
                  {!permissions?.find((p) => p.email === email.toLowerCase())?.expedienteIds.length && (
                    <span className="text-muted-foreground">(all files)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
