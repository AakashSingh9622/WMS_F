"use client"

import type { ReactNode } from "react"
import { toast } from "sonner"

import {
  Building,
  Copy,
  Flag,
  Hash,
  Mail,
  Manager,
  MapPin,
  Megaphone,
  Phone,
  User,
  type AppIcon,
} from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useClientCard } from "@/hooks/useClientCard"
import { cn } from "@/lib/utils"
import { EditClientButton } from "@/staff/features/clients/edit-client-dialog"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const ACTIVE: Record<string, string> = { yes: "Active", no: "Inactive", hid: "Hidden" }

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Couldn't copy the ${what.toLowerCase()} — select it and copy instead`)
  }
}

/**
 * One row: icon, small label, the value (or "Not on file"). The copy button shows on hover / keyboard focus, so the
 * list stays calm but every value is one click from the clipboard.
 */
function Row({
  icon: Icon,
  label,
  children,
  empty,
  copyText,
  copyAs,
}: {
  icon: AppIcon
  label: string
  children?: ReactNode
  empty?: boolean
  copyText?: string
  copyAs?: string // the toast's name for it, e.g. "Email"
}) {
  return (
    <div className="group flex items-start gap-3 py-2.5">
      <Icon className="text-muted-foreground mt-0.5 size-4" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</p>
        <div className="text-sm break-words">
          {empty ? <span className="text-muted-foreground">Not on file</span> : children}
        </div>
      </div>
      {!empty && copyText && copyAs && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label.toLowerCase()}`}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => copy(copyText, copyAs)}
        >
          <Copy className="size-4" />
        </Button>
      )}
    </div>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-muted-foreground mb-1 text-xs font-semibold">{title}</h3>
      <div className="divide-y">{children}</div>
    </div>
  )
}

const link = "hover:text-primary hover:underline"

/**
 * Overview → Reference details: the client's header (name, id, state, Edit client) and what DocuSoft holds about it —
 * addresses, email, phones, main contact, manager, source, business type, status. All from the client card the page
 * already loaded (Json_GetClientCardDetails: Table1 = the client, Table6 = its contacts), so nothing extra is fetched.
 */
export function ClientReferenceDetails({ clientId }: { clientId: string }) {
  const { name, record, address, billingText, registeredText, contacts } = useClientCard(clientId)
  const r = record ?? {}

  const main = contacts.find((c) => c["Main Contact"] === true) ?? contacts[0]
  const mainName = main ? [s(main["First Name"]), s(main["Last Name"])].filter(Boolean).join(" ") : ""
  const mainEmail = main ? s(main["E-Mail"]) : ""

  const email = s(r.Email)
  const tel = s(r.TelNo)
  const altTel = s(r.AltTelNo)
  const state = ACTIVE[s(r.OrgActive).toLowerCase()] ?? ""
  const statusName = s(r.StatusName)
  // DocuSoft's status, plus the active state only when it says something else ("Active · Active" reads as one)
  const status = [statusName, state.toLowerCase() === statusName.toLowerCase() ? "" : state].filter(Boolean).join(" · ")
  const companyNo = s(r.CompanyNo)

  return (
    <section className="bg-card rounded-xl border">
      {/* header: who this is, and the way to change it */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{name ?? clientId}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono">{clientId}</span>
            {state && (
              <Badge
                variant="outline"
                className={cn(state === "Active" ? "border-status-stored text-status-stored" : "text-muted-foreground")}
              >
                {state}
              </Badge>
            )}
            {s(r.BussName) && <span className="text-muted-foreground truncate">{s(r.BussName)}</span>}
          </div>
        </div>
        <EditClientButton clientId={clientId} />
      </div>

      <div className="grid gap-x-8 gap-y-4 p-4 pt-3 md:grid-cols-2">
        <Column title="Contact">
          <Row icon={MapPin} label="Address" empty={!address} copyText={address} copyAs="Address">
            {address}
          </Row>
          {billingText && (
            <Row icon={MapPin} label="Billing address" copyText={billingText} copyAs="Address">
              {billingText}
            </Row>
          )}
          {registeredText && (
            <Row icon={MapPin} label="Registered address" copyText={registeredText} copyAs="Address">
              {registeredText}
            </Row>
          )}
          <Row icon={Mail} label="Email" empty={!email} copyText={email} copyAs="Email">
            <a href={`mailto:${email}`} className={link}>
              {email}
            </a>
          </Row>
          <Row icon={Phone} label="Telephone" empty={!tel} copyText={tel} copyAs="Telephone">
            <a href={`tel:${tel.replace(/\s+/g, "")}`} className={link}>
              {tel}
            </a>
          </Row>
          {altTel && (
            <Row icon={Phone} label="Other telephone" copyText={altTel} copyAs="Telephone">
              <a href={`tel:${altTel.replace(/\s+/g, "")}`} className={link}>
                {altTel}
              </a>
            </Row>
          )}
          <Row
            icon={User}
            label="Main contact"
            empty={!mainName && !mainEmail}
            copyText={mainEmail || mainName}
            copyAs={mainEmail ? "Email" : "Main contact"}
          >
            {mainName && <span className="block">{mainName}</span>}
            {mainEmail && (
              <a href={`mailto:${mainEmail}`} className={cn(link, "text-muted-foreground block text-xs")}>
                {mainEmail}
              </a>
            )}
          </Row>
        </Column>

        <Column title="Company">
          <Row icon={Manager} label="Manager" empty={!s(r.UserName)}>
            {s(r.UserName)}
          </Row>
          <Row icon={Megaphone} label="Source" empty={!s(r.SourceName)}>
            {s(r.SourceName)}
          </Row>
          <Row icon={Building} label="Business type" empty={!s(r.BussName)}>
            {s(r.BussName)}
          </Row>
          <Row icon={Flag} label="Status" empty={!status}>
            {status}
          </Row>
          {companyNo && (
            <Row icon={Hash} label="Company number" copyText={companyNo} copyAs="Company number">
              <span className="font-mono">{companyNo}</span>
            </Row>
          )}
        </Column>
      </div>
    </section>
  )
}
