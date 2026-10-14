import { requireSide } from "@/auth/session"
import { StaffShell } from "@/staff/staff-shell"

export default async function StaffLayout({ children }: LayoutProps<"/app">) {
  await requireSide("staff")
  return <StaffShell>{children}</StaffShell>
}
