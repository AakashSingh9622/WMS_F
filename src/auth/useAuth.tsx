"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDispatch } from "react-redux"

import { SESSION_COOKIE } from "@/auth/session-shared"
import { clearDocusoftCredentials, storeDocusoftCredentials } from "@/store/docusoftCreds"
import { docusoftApi } from "@/store/docusoftApi"
import { clientsUiReset } from "@/store/clientsUiSlice"
import type { Role } from "@/api/types"

export interface AuthUser {
  id: string
  name: string
  email: string
  side: "staff" | "client"
  roles: Role[]
  clientId?: string
}

interface LoginInput {
  email: string
  password: string
}

interface AuthContextValue {
  user: AuthUser | null | undefined
  isLoading: boolean
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me")
  if (res.status === 401) return null
  if (!res.ok) throw new Error("Failed to load session")
  return res.json()
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const dispatch = useDispatch()

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  })

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? "Invalid email or password")
      }
      const data = (await res.json()) as {
        user: AuthUser
        token: string
        agrno?: string
      }
      // Mock-only: the real backend should set an httpOnly cookie itself;
      // this client-side write exists only so proxy.ts (server) can read it.
      document.cookie = `${SESSION_COOKIE}=${data.token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
      // Staff logins also get an `agrno` back — stash it with the email/password (base64, same
      // form DocuSoft expects) the user just typed, so src/api/docusoft.ts can call DocuSoft's
      // folders/clients endpoints directly from the browser without asking again. Portal/client
      // logins don't have an agrno yet (that side isn't wired to DocuSoft), so this is skipped.
      if (data.agrno) {
        // Fresh login (maybe a different account in the same tab) — never reuse another user's cache.
        dispatch(docusoftApi.util.resetApiState())
        dispatch(clientsUiReset())
        storeDocusoftCredentials({
          agrno: data.agrno,
          Email: input.email,
          password: btoa(input.password),
        })
      }
      return data.user
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" })
      clearSessionCookie()
      clearDocusoftCredentials()
      dispatch(docusoftApi.util.resetApiState())
      dispatch(clientsUiReset())
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null)
    },
  })

  const login = useCallback((input: LoginInput) => loginMutation.mutateAsync(input), [loginMutation])
  const logout = useCallback(() => logoutMutation.mutateAsync(), [logoutMutation])

  const value = useMemo<AuthContextValue>(
    () => ({ user: meQuery.data, isLoading: meQuery.isLoading, login, logout }),
    [meQuery.data, meQuery.isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
