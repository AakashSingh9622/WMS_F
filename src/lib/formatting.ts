const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
  { amount: Number.POSITIVE_INFINITY, unit: "years" },
]

export function formatRelativeTime(iso: string): string {
  let duration = (new Date(iso).getTime() - Date.now()) / 1000
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) return RTF.format(Math.round(duration), division.unit)
    duration /= division.amount
  }
  return RTF.format(Math.round(duration), "years")
}

const pad = (n: number) => String(n).padStart(2, "0")

// Every date the app shows is dd/mm/yyyy. "2026-10-07" (date only) is read as written -- no time-zone shift.
export function formatDate(value?: string | null): string {
  if (!value) return ""
  const plain = /^(d{4})-(d{2})-(d{2})$/.exec(value)
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(value?: string | null): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${formatDate(value)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateRange(from?: string | null, to?: string | null): string {
  return `${formatDate(from)}${to ? ` – ${formatDate(to)}` : ""}`
}

/** Today as "yyyy-mm-dd" in the user's own time zone — the value format of <input type="date">. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
