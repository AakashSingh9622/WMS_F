"use client"

import { User } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/auth/useAuth"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ProfileScreen() {
  const { user } = useAuth()

  return (
    <div className="max-w-md space-y-6">
      <PageHeader icon={User} title="Profile" description="Your account details." />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="profile-name">Name</FieldLabel>
          <Input id="profile-name" value={user?.name ?? ""} disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-email">Email</FieldLabel>
          <Input id="profile-email" value={user?.email ?? ""} disabled />
        </Field>
      </FieldGroup>
    </div>
  )
}
