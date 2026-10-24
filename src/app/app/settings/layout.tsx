import { requireSide } from "@/auth/session"
import { can } from "@/domain/permissions"
import { SettingsNav } from "@/staff/settings-nav"

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  const session = await requireSide("staff")
  const allowed = (permission: Parameters<typeof can>[1]) => can(session.roles, permission)

  const items = [
    { href: "/app/settings/profile", label: "Profile" },
    ...(allowed("layout.manage") ? [{ href: "/app/settings/warehouse-layout", label: "Warehouse layout" }] : []),
    ...(allowed("settings.manage") ? [{ href: "/app/settings/box-sizes", label: "Box sizes" }] : []),
    { href: "/app/settings/labels", label: "Labels" },
    ...(allowed("settings.manage") ? [{ href: "/app/settings/orders", label: "Orders" }] : []),
    ...(allowed("users.manage") ? [{ href: "/app/settings/users", label: "Users & roles" }] : []),
    ...(allowed("billing.view") ? [{ href: "/app/settings/sage", label: "Sage One" }] : []),
  ]

  return (
    <div className="flex gap-6">
      <SettingsNav items={items} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
