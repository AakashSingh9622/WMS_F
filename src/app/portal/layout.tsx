import { requireSide } from "@/auth/session"
import { PortalShell } from "@/portal/portal-shell"

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  await requireSide("client")
  return <PortalShell>{children}</PortalShell>
}
