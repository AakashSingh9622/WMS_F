import { requireAuth } from "@/auth/session"

// Bare layout, no chrome — print-only documents (spec §2, §9).
export default async function PrintLayout({ children }: LayoutProps<"/print">) {
  await requireAuth()
  return <div className="print:m-0 print:p-0">{children}</div>
}
