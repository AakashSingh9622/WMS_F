"use client"

import { useAuth } from "@/auth/useAuth"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function PortalSettingsScreen() {
  const { user } = useAuth()

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Your profile.</p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="portal-name">Name</FieldLabel>
          <Input id="portal-name" value={user?.name ?? ""} disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-email">Email</FieldLabel>
          <Input id="portal-email" value={user?.email ?? ""} disabled />
        </Field>
      </FieldGroup>
    </div>
  )
}
