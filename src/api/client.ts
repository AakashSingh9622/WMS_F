import type { ZodType } from "zod"

// NEXT_PUBLIC_API_URL empty means same-origin — mock mode intercepts these via
// MSW's service worker. Every request goes under /api/* so it can never collide
// with a same-origin page route (e.g. the mock's own /portal/orders would
// otherwise hijack the browser's navigation to the /portal/orders *page* —
// MSW's service worker intercepts full navigations too, not just fetch() calls).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""
const API_PREFIX = "/api"

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  if (res.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // Plain module, not a component — no useRouter() here. A hard nav is also
      // correct anyway: it clears React Query cache/session state along with it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login"
    }
    throw new ApiError(401, "Not authenticated")
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message ?? res.statusText, body.code)
  }

  if (res.status === 204) return undefined
  return res.json()
}

/** Parses a response with its zod schema; throws a descriptive error on mismatch instead of returning bad data. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(`API response failed schema validation: ${result.error.message}`)
  }
  return result.data
}

export const apiClient = {
  get: (path: string, init?: RequestInit) => request(path, { ...init, method: "GET" }),
  post: (path: string, body?: unknown, init?: RequestInit) =>
    request(path, { ...init, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown, init?: RequestInit) =>
    request(path, { ...init, method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: unknown, init?: RequestInit) =>
    request(path, { ...init, method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (path: string, init?: RequestInit) => request(path, { ...init, method: "DELETE" }),
}
