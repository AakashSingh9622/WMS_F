import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { Role } from "@/api/types"
import { SESSION_COOKIE, decodeSession, homeForSide, type SessionClaims } from "@/auth/session-shared"

export { SESSION_COOKIE, encodeSession, decodeSession, homeForSide, type SessionClaims } from "@/auth/session-shared"

/** Server Component only: reads the session cookie for use in layouts and pages. */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return decodeSession(token)
}

/** Server Component only: any authenticated user, either side (used by /print/*). */
export async function requireAuth(): Promise<SessionClaims> {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}

/** Server Component only: redirects to /login, then the user's own home, when the session doesn't satisfy the guard. */
export async function requireSide(side: SessionClaims["side"]): Promise<SessionClaims> {
  const session = await getSession()
  if (!session) redirect(`/login?redirectTo=${encodeURIComponent(`/${side === "staff" ? "app" : "portal"}`)}`)
  if (session.side !== side) redirect(homeForSide(session.side))
  return session
}

export async function requireRole(role: Role): Promise<SessionClaims> {
  const session = await requireSide(role.startsWith("staff") ? "staff" : "client")
  if (!session.roles.includes(role)) redirect("/403")
  return session
}
