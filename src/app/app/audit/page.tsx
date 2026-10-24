import { requirePermission } from "@/auth/session"
import { AuditLogScreen } from "@/staff/features/audit/audit-log-screen"

export default async function AuditLogPage() {
  await requirePermission("audit.read")
  return <AuditLogScreen />
}
