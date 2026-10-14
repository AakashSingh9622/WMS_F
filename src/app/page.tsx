import { redirect } from "next/navigation"

import { getSession, homeForSide } from "@/auth/session"

export default async function RootPage() {
  const session = await getSession()
  redirect(session ? homeForSide(session.side) : "/login")
}
