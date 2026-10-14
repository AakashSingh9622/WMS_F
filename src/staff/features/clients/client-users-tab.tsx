"use client"

import Link from "next/link"

import { useClientCard } from "@/hooks/useClientCard"
import type { DocusoftContact } from "@/store/docusoftApi"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())

// DocuSoft has no fixed phone column name, so take the first contact field that looks like one.
function phoneOf(contact: DocusoftContact): string {
  const key = Object.keys(contact).find((k) => /tel|phone|mobile/i.test(k) && text(contact[k]))
  return key ? text(contact[key]) : ""
}

// "Users" = all the contacts DocuSoft holds for this client (Table6 of the client card).
export function ClientUsersTab({ clientId }: { clientId: string }) {
  const { contacts, needsFolder, isLoading, isError } = useClientCard(clientId)

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
            <div className="flex shrink-0 gap-1.5">
              {contact["Main Contact"] === true && <Badge variant="outline">Main contact</Badge>}
              {contact["Portal User"] === true && <Badge variant="outline">Portal user</Badge>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
