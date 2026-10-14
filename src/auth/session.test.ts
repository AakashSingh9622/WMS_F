import { describe, expect, it } from "vitest"

import { decodeSession, encodeSession, homeForSide } from "@/auth/session-shared"

describe("session token", () => {
  it("round-trips claims through encode/decode", () => {
    const claims = {
      userId: "u-1",
      name: "Ahmed Khan",
      email: "admin@demo.test",
      side: "staff" as const,
      roles: ["staff_admin" as const],
    }

    expect(decodeSession(encodeSession(claims))).toEqual(claims)
  })

  it("returns null for a malformed token instead of throwing", () => {
    expect(decodeSession("not-valid-base64url-json")).toBeNull()
  })

  it("routes staff to /app and clients to /portal", () => {
    expect(homeForSide("staff")).toBe("/app")
    expect(homeForSide("client")).toBe("/portal")
  })
})
