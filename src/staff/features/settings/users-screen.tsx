"use client"

import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useAdminAudit, useSetUserRoles, useStaffUsers, type StaffUser } from "@/api/users"
import type { Role } from "@/api/types"
import { ASSIGNABLE_ROLES, ROLE_INFO, roleLabel } from "@/domain/permissions"
import { formatDateTime } from "@/lib/formatting"
import { Users } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function onError(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : "Could not save the roles")
}

/** One checkbox per assignable role, with what that role may do. */
function RolePicker({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  return (
    <div className="space-y-3">
      {ASSIGNABLE_ROLES.map((role) => (
        <label key={role} className="flex cursor-pointer items-start gap-3">
          <Checkbox
            className="mt-0.5"
            checked={value.includes(role)}
            onCheckedChange={(checked) => onChange(checked ? [...value, role] : value.filter((r) => r !== role))}
          />
          <span className="text-sm">
            <span className="font-medium">{roleLabel(role)}</span>
            <span className="text-muted-foreground block text-xs">{ROLE_INFO[role]?.description}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

function EditRolesDialog({ user }: { user: StaffUser }) {
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState<Role[]>(user.roles)
  const save = useSetUserRoles()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setRoles(user.roles) // start from what is saved every time it opens
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit roles</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {user.name ?? user.email}</DialogTitle>
        </DialogHeader>
        {user.docusoftAdmin && (
          <p className="text-muted-foreground rounded-lg border p-3 text-xs">
            Administrator in DocuSoft — can already do everything here. Roles below only matter if that changes in
            DocuSoft.
          </p>
        )}
        <RolePicker value={roles} onChange={setRoles} />
        <p className="text-muted-foreground text-xs">
          No role ticked = warehouse operator. Buttons update within a minute; pages that need a new role open after
          their next sign-in.
        </p>
        <DialogFooter>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { email: user.email, roles },
                {
                  onSuccess: () => {
                    toast.success("Roles saved")
                    setOpen(false)
                  },
                  onError,
                },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Give roles to someone by e-mail — works before their first sign-in too. */
function AddByEmailDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [roles, setRoles] = useState<Role[]>([])
  const save = useSetUserRoles()
  const valid = /^[^\s@]+@[^\s@]+$/.test(email.trim()) && roles.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Give a role by e-mail</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give a role by e-mail</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="role-email">DocuSoft e-mail</FieldLabel>
          <Input id="role-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldDescription>The roles apply when this person signs in with DocuSoft.</FieldDescription>
        </Field>
        <RolePicker value={roles} onChange={setRoles} />
        <DialogFooter>
          <Button
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate(
                { email: email.trim(), roles },
                {
                  onSuccess: () => {
                    toast.success("Roles saved")
                    setOpen(false)
                    setEmail("")
                    setRoles([])
                  },
                  onError,
                },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecentRoleChanges() {
  const { data, isLoading } = useAdminAudit({ entityType: "user", pageSize: 10 })
  if (isLoading) return <Skeleton className="h-20 w-full" />
  if (!data?.items.length) return <p className="text-muted-foreground text-sm">No role changes yet.</p>
  return (
    <ul className="space-y-1.5 text-sm">
      {data.items.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2">
          <span>{e.summary}</span>
          <span className="text-muted-foreground">
            — {e.actor.name}, {formatDateTime(e.at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function UsersScreen() {
  const { data, isLoading } = useStaffUsers()

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        icon={Users}
        title="Users & roles"
        description="Everyone who signs in with DocuSoft for this agreement is a warehouse operator unless given other roles here. Administrators come from DocuSoft."
        actions={<AddByEmailDialog />}
      />

      {isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="bg-card rounded-2xl border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Can act as</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user) => (
                <TableRow key={user.email}>
                  <TableCell>
                    <div className="font-medium">{user.name ?? user.email}</div>
                    {user.name && <div className="text-muted-foreground text-xs">{user.email}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.effectiveRoles.map((role) => (
                        <Badge key={role} variant={role === "staff_admin" ? "default" : "secondary"}>
                          {roleLabel(role)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.hasLoggedIn ? formatDateTime(user.lastLoginAt) : "Not signed in yet"}
                  </TableCell>
                  <TableCell>
                    <EditRolesDialog user={user} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Recent role changes</h2>
        <RecentRoleChanges />
      </section>
    </div>
  )
}
