import { requireSide } from "@/auth/session"
import { SettingsNav } from "@/staff/settings-nav"

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  const session = await requireSide("staff")
  const isAdmin = session.roles.includes("staff_admin")

  const items = [
    { href: "/app/settings/profile", label: "Profile" },
    ...(isAdmin ? [{ href: "/app/settings/warehouse-layout", label: "Warehouse layout" }] : []),
    ...(isAdmin ? [{ href: "/app/settings/box-sizes", label: "Box sizes" }] : []),
    { href: "/app/settings/labels", label: "Labels" },
    ...(isAdmin ? [{ href: "/app/settings/orders", label: "Orders" }] : []),
    ...(isAdmin ? [{ href: "/app/settings/users", label: "Users" }] : []),
  ]

  return (
    <div className="flex gap-6">
      <SettingsNav items={items} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
