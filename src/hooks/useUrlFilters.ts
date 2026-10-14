"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo } from "react"

/**
 * Reads/writes search, filter, sort, and pagination state to/from the URL (spec §2/§7) so
 * searches survive a refresh, the back button works, and a result set is shareable as a link.
 */
export function useUrlFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const params = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])

  const setParams = useCallback(
    (next: Record<string, string | string[] | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(next)) {
        sp.delete(key)
        if (value === undefined || value === "") continue
        if (Array.isArray(value)) {
          for (const v of value) sp.append(key, v)
        } else {
          sp.set(key, value)
        }
      }
      router.push(`${pathname}?${sp.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const clear = useCallback(() => router.push(pathname, { scroll: false }), [router, pathname])

  return { params, getAll: (key: string) => searchParams.getAll(key), setParams, clear }
}
