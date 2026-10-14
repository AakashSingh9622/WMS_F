import { http, HttpResponse, delay } from "msw"

import { SESSION_COOKIE, encodeSession, decodeSession } from "@/auth/session-shared"
import { seedUsers } from "@/mocks/seed"
import type { AuthUser } from "@/auth/useAuth"
import type { Actor } from "@/api/types"

function toAuthUser(u: (typeof seedUsers)[number]): AuthUser {
  return { id: u.id, name: u.name, email: u.email, side: u.side, roles: u.roles, clientId: u.clientId }
}

// MSW's browser worker can't read the "Cookie" request header — browsers treat
// it as a forbidden header and never expose it to a Service Worker's
// intercepted Request. Handler resolvers do run in the page's main thread
// though (msw/browser forwards fetch events there via postMessage), so
// document.cookie is readable directly — that's the documented workaround.
export function readSessionCookie() {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  if (!match) return null
  return decodeSession(match.slice(SESSION_COOKIE.length + 1))
}

/** The logged-in user as an Actor, for stamping on audit events / order fields. */
export function actorFromSession(): Actor | null {
  const claims = readSessionCookie()
  if (!claims) return null
  return { id: claims.userId, name: claims.name, side: claims.side }
}

// No longer registered in handlers.ts — staff login now goes to the real backend via
// next.config.ts rewrites. Kept here as a reference for the response shape the backend mirrors,
// and because readSessionCookie/actorFromSession above (used by boxes/orders/portal mocks) live
// in this same file.
export const authHandlers = [
  http.post("/api/auth/login", async ({ request }) => {
    await delay(200)
    const body = (await request.json()) as { email?: string; password?: string }
    const user = seedUsers.find((u) => u.email === body.email)
    if (!user || user.password !== body.password) {
      return HttpResponse.json({ message: "Invalid email or password" }, { status: 401 })
    }
    const token = encodeSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      side: user.side,
      roles: user.roles,
      clientId: user.clientId,
    })
    return HttpResponse.json({ user: toAuthUser(user), token })
  }),

  http.post("/api/auth/logout", async () => {
    await delay(100)
    return HttpResponse.json({ ok: true })
  }),

  http.get("/api/auth/me", async () => {
    await delay(100)
    const claims = readSessionCookie()
    if (!claims) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    const user = seedUsers.find((u) => u.id === claims.userId)
    if (!user) return HttpResponse.json({ message: "Not authenticated" }, { status: 401 })
    return HttpResponse.json(toAuthUser(user))
  }),
]
