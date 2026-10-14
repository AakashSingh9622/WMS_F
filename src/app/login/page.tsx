"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "@/components/icons"

import { useAuth } from "@/auth/useAuth"
import { cn } from "@/lib/utils"
import { displayFont, monoFont } from "@/app/login/fonts"

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})
type LoginValues = z.infer<typeof loginSchema>

const STAGES = ["Collection", "Storage", "Dispatch", "Destruction"]

// Brand look for the login screen only (the app itself keeps its own theme).
const ACCENT = "bg-[#b93c2e] hover:bg-[#a43427] focus-visible:ring-[#b93c2e]/40"

function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <span className="inline-flex">
        <Image src="/login/DocuLogo.png" alt="DocuSoft" width={300} height={125} className="h-16 w-auto" priority />
      </span>
      <span className="font-(family-name:--font-login-mono) block text-[11px] tracking-[0.18em] uppercase opacity-60">
        Records Warehouse
      </span>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    try {
      const user = await login(values)
      const redirectTo = searchParams.get("redirectTo")
      const home = user.side === "staff" ? "/app" : "/portal"
      router.push(
        redirectTo && redirectTo.startsWith(`/${user.side === "staff" ? "app" : "portal"}`) ? redirectTo : home,
      )
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-black/10 bg-white pl-10 text-sm text-[#101827] shadow-xs outline-none transition placeholder:text-black/35 focus:border-[#b93c2e] focus:ring-4 focus:ring-[#b93c2e]/15 aria-invalid:border-red-500"

  return (
    <div className={cn(displayFont.variable, monoFont.variable, "grid min-h-svh bg-[#f5f4ef] lg:grid-cols-2")}>
      {/* ── Left: brand panel (desktop only) ─────────────────────────────── */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden bg-[#0f1620] bg-cover bg-center p-12 text-white lg:flex"
        style={{ backgroundImage: "url(/login/background-panel.png)" }}
      >
        <Brand />

        <div className="max-w-lg space-y-8">
          <div className="space-y-4">
            <h2 className="font-(family-name:--font-login-display) text-5xl leading-[1.05] font-semibold tracking-tight">
              Physical document storage, managed end to end.
            </h2>
            <p className="text-base text-white/70">Track every box and file from collection to destruction.</p>
          </div>

          <Image
            src="/login/rack-graphic.png"
            alt="A warehouse rack, with a few highlighted boxes being scanned"
            width={1120}
            height={300}
            priority
            className="w-full max-w-[34rem] rounded-2xl"
          />
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
          {STAGES.map((stage) => (
            <li key={stage} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d9442f]" aria-hidden />
              {stage}
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Right: sign-in form ──────────────────────────────────────────── */}
      <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Brand className="mb-10 text-[#101827] lg:hidden" />

          <div className="space-y-1.5">
            <h1 className="font-(family-name:--font-login-display) text-3xl font-semibold tracking-tight text-[#101827]">
              Welcome back
            </h1>
            <p className="text-sm text-black/55">Sign in to your document warehouse account.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[#101827]">
                Work email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-black/40" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={!!errors.email}
                  className={inputClass}
                  {...register("email")}
                />
              </div>
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#101827]">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-black/40" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  className={cn(inputClass, "pr-10")}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-black/45 hover:text-black/80"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {/* Forgot password is switched off for now (login is verified against DocuSoft). Re-enable when needed:
            <a href="/forgot-password" className="text-xs underline underline-offset-4">Forgot password?</a>
            */}

            {formError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white shadow-xs transition outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-70",
                ACCENT,
              )}
            >
              {isSubmitting ? (
                "Signing in…"
              ) : (
                <>
                  Sign in <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-black/55">New to the team? Ask your administrator for access.</p>

          <p className="mt-12 text-xs text-black/40">© {new Date().getFullYear()} DocuSoft</p>
        </div>
      </main>
    </div>
  )
}
