import { requireRole } from "@/auth/session"
import { AuditLogScreen } from "@/staff/features/audit/audit-log-screen"

export default async function AuditLogPage() {
  await requireRole("staff_admin")
  return <AuditLogScreen />
}
