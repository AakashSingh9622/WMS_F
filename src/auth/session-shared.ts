import type { ActorSide, Role } from "@/api/types"

// Pure, environment-agnostic pieces of the session module — no `next/headers`
// (Server Component only) or `next/navigation` here, so this file is safe to
// import from src/proxy.ts (middleware/proxy runtime), client components
// (src/auth/useAuth.tsx), and MSW handlers (src/mocks/handlers.ts) alike.
// Server-only helpers (getSession, requireRole, ...) live in session.ts.
export const SESSION_COOKIE = "wms_session"

export interface SessionClaims {
  userId: string
  name: string
  email: string
  side: Exclude<ActorSide, "system">
  roles: Role[]
  clientId?: string
  exp?: number // seconds since epoch — set by the real backend's signed session token (JWT)
}

// Encoded with atob/btoa + TextEncoder/TextDecoder rather than Node's Buffer,
// since this runs both server-side (proxy.ts, session.ts) and browser-side
// (the MSW service worker in mocks/handlers.ts, which has no Buffer global).
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("")
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(token: string): string {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=")
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeSession(claims: SessionClaims): string {
  return toBase64Url(JSON.stringify(claims))
}

// Accepts the real backend's signed token (JWT: header.payload.signature — only the payload is read here, the
// signature is verified by the backend on every API call) and the plain base64 JSON the MSW mock still issues.
export function decodeSession(token: string): SessionClaims | null {
  try {
    const parts = token.split(".")
    const claims = JSON.parse(fromBase64Url(parts.length === 3 ? parts[1] : token)) as SessionClaims
    if (claims.exp && claims.exp * 1000 < Date.now()) return null // expired
    return claims
  } catch {
    return null
  }
}

export function homeForSide(side: ActorSide): string {
  return side === "staff" ? "/app" : "/portal"
}
