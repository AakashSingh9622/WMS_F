"use client"

import { useEffect, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Provider as ReduxProvider } from "react-redux"
import { ThemeProvider } from "next-themes"

import { AuthProvider } from "@/auth/useAuth"
import { store } from "@/store"
import { restoreAndPersistClientsUi } from "@/store/persistClientsUi"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true"

// ssr: false keeps mock-gate.tsx (and its msw/browser import) out of the server
// compilation graph entirely — see the comment in mock-gate.tsx for why.
const MockGate = dynamic(() => import("@/core/mock-gate").then((m) => m.MockGate), {
  ssr: false,
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  )

  // After mount (sessionStorage does not exist during SSR): restore the Clients screen state saved before a reload.
  useEffect(() => restoreAndPersistClientsUi(store), [])

  const app = (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ReduxProvider>
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {useMocks ? <MockGate>{app}</MockGate> : app}
    </ThemeProvider>
  )
}
