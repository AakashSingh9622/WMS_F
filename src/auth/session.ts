import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { Role } from "@/api/types"
import { can, type Permission } from "@/domain/permissions"
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

/**
 * Server Component only: staff page that needs a permission (src/domain/permissions.ts). Reads the roles in the
 * session cookie, which are set at login — a role given or taken away later reaches page guards at the next login
 * (the API and the buttons use fresh roles straight away).
 */
export async function requirePermission(permission: Permission): Promise<SessionClaims> {
  const session = await requireSide("staff")
  if (!can(session.roles, permission)) redirect("/403")
  return session
}
