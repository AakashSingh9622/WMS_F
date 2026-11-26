import { requirePermission } from "@/auth/session"
import { ContactUdfScreen } from "@/staff/features/settings/contact-udf-screen"

export default async function ContactUdfSettingsPage() {
  await requirePermission("settings.manage")
  return <ContactUdfScreen />
}
