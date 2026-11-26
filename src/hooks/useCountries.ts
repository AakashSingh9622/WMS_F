"use client"

import { useEffect, useState } from "react"

import { loadCountries, type Country } from "@/domain/countries"

/** The country list for address forms (undefined while it loads — it is fetched the first time a form needs it). */
export function useCountries(): Country[] | undefined {
  const [countries, setCountries] = useState<Country[]>()
  useEffect(() => {
    let alive = true
    loadCountries().then((list) => alive && setCountries(list))
    return () => {
      alive = false
    }
  }, [])
  return countries
}
