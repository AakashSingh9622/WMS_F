"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { errorText } from "@/staff/features/clients/client-form-fields"
import { DOCUSOFT_PORTAL_SITE, DOCUSOFT_WWW } from "@/store/docusoftConfig"
import { getDocusoftCredentials } from "@/store/docusoftCreds"
import {
  DEFAULT_PORTAL_OPTIONS,
  useCreatePortalUserMutation,
  type DocusoftContact,
  type PortalUserOptions,
} from "@/store/docusoftApi"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())

// The Create Portal form's options, in DocuSoft's order (onboard.js createportalArr).
const OPTIONS: [keyof PortalUserOptions, string][] = [
  ["PresetMemorableData", "Preset Memorable Data"],
  ["IssueReminders", "Issue Reminders"],
  ["ExcludeMessageLink", "Exclude Message Link"],
  ["KeepSignedIn", "Keep Signed In"],
  ["AllowUpload", "Allow Upload"],
  ["ChangeProfile", "Change Profile"],
  ["LoggedIn", "Logged In"],
  ["Blocked", "Blocked"],
]

/**
 * The portal's own settings page of this portal user (password and the rest) — the "View Portal" link of DocuSoft's
 * contact page (onboard.js #ViewPortalUserButt), opened in a new tab.
 */
function portalSettingsUrl(contact: DocusoftContact, clientId: string, clientName: string): string | null {
  const creds = getDocusoftCredentials()
  if (!creds) return null
  const q = new URLSearchParams({
    accid: creds.agrno,
    email: creds.Email,
    check: creds.password,
    host: DOCUSOFT_WWW,
    practice: "",
    newclient: s(contact["OriginatorNo"]) || clientId,
    newemail: s(contact["E-Mail"]),
    clientname: s(contact["Company Name"]) || clientName,
    contactname: [s(contact["First Name"]), s(contact["Last Name"])].filter(Boolean).join(" "),
    option: "view",
  })
  return `${DOCUSOFT_PORTAL_SITE}/UserSettings.aspx?${q.toString()}`
}

/**
 * Edit contact → the contact's client portal account, as on DocuSoft's contact page: already a portal user → open its
 * portal settings (to change the password); not yet → "Create portal", which asks for the account's options and
 * creates it (PortalUserAccountCreated_Json).
 */
export function ContactPortal({
  clientId,
  clientName,
  contact,
}: {
  clientId: string
  clientName: string
  contact: DocusoftContact
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<PortalUserOptions>(DEFAULT_PORTAL_OPTIONS)
  const [created, setCreated] = useState(false) // until the refreshed contact list says so
  const [createPortalUser, { isLoading }] = useCreatePortalUserMutation()

  const email = s(contact["E-Mail"])
  const isPortalUser = created || contact["Portal User"] === true || s(contact["Portal User"]).toLowerCase() === "true"
  const inactive = s(contact["Active"]).toLowerCase() === "no"

  const openForm = () => {
    // the same checks as DocuSoft's page before it shows the form
    if (!email || email.toLowerCase().includes("@noemail")) return toast.error("Please use a valid email address")
    if (inactive) return toast.error("This contact is inactive")
    setOptions(DEFAULT_PORTAL_OPTIONS)
    setOpen(true)
  }

  const create = async () => {
    try {
      await createPortalUser({ clientId, clientName, contactEmail: email, options }).unwrap()
      toast.success("Portal created successfully")
      setCreated(true)
      setOpen(false)
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const viewPortal = () => {
    const url = portalSettingsUrl(contact, clientId, clientName)
    if (!url) return toast.error("Not connected to DocuSoft — please sign in again")
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Client portal
          {isPortalUser && <Badge variant="secondary">Portal user</Badge>}
        </h3>
        <p className="text-muted-foreground text-xs">
          {isPortalUser
            ? "This contact has a portal account. Change its password and settings on the portal."
            : "This contact has no portal account yet."}
        </p>
      </div>
      {isPortalUser ? (
        <Button type="button" variant="outline" size="sm" onClick={viewPortal}>
          View portal / change password
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={openForm}>
          Create portal
        </Button>
      )}

      <Dialog open={open} onOpenChange={(next) => !isLoading && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create portal</DialogTitle>
            <DialogDescription>A portal account for {email}, saved in DocuSoft.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-sm sm:grid-cols-3">
            {OPTIONS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options[key]}
                  disabled={isLoading}
                  onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="button" onClick={create} disabled={isLoading}>
              {isLoading ? "Creating…" : "Create portal account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
