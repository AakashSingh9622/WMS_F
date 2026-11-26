/**
 * Countries with their counties / states, for address forms. The same list DocuSoft's own Add Client page uses
 * (docusoftpractice main_js/StatecountrySon.js → StateManager), copied into countries.json so the County and Country
 * dropdowns offer exactly what DocuSoft stores. Loaded only when a form needs it (it is ~80 KB).
 */
export interface Country {
  name: string // DocuSoft stores the country by this name
  code: string // ISO 3166-1 alpha-2, e.g. "GB"
  states: string[] // the country's counties / states (may be empty)
}

/** DocuSoft's default country for a new address. */
export const DEFAULT_COUNTRY = "United Kingdom"

/** The country's flag (the same flagcdn.com images DocuSoft shows). */
export const flagUrl = (code: string) => `https://flagcdn.com/${code.toLowerCase()}.svg`

let loading: Promise<Country[]> | null = null

export function loadCountries(): Promise<Country[]> {
  loading ??= import("./countries.json").then((m) => m.default as Country[])
  return loading
}
