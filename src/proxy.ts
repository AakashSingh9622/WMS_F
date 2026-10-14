import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE, decodeSession, homeForSide } from "@/auth/session-shared"

// Renamed from middleware.ts in Next.js 16 (same behavior, new file/export name).
// This is the coarse guard only — redirect unauthenticated/wrong-side traffic.
// Role-specific checks (e.g. staff_admin-only settings pages) happen in the
// route itself via requireRole(), per Next's own guidance that proxy is not a
// full authorization solution.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? decodeSession(token) : null

  const isStaffPath = pathname.startsWith("/app")
  const isPortalPath = pathname.startsWith("/portal")

  if ((isStaffPath || isPortalPath) && !session) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (session && isStaffPath && session.side !== "staff") {
    return NextResponse.redirect(new URL(homeForSide(session.side), request.url))
  }

  if (session && isPortalPath && session.side !== "client") {
    return NextResponse.redirect(new URL(homeForSide(session.side), request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/app/:path*", "/portal/:path*"],
}
