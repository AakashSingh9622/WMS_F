"use client"

import { useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { errorText } from "@/staff/features/clients/client-form-fields"
import { useGetDocumentCountsQuery } from "@/store/docusoftApi"

// The chart draws the last two years at most; the table always lists every month.
const MAX_MONTHS = 24
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
const NUMBER = new Intl.NumberFormat("en-GB")

// The staff teal, one step brighter in light mode so the bars don't read grey (checked with the dataviz palette
// validator: lightness, chroma and contrast against the card, in both modes).
const BAR = "bg-[oklch(0.6_0.12_200)] dark:bg-[oklch(0.65_0.12_200)]"

interface MonthCount {
  key: string // yyyy-mm
  label: string // "Nov 26"
  long: string // "November 2026"
  count: number
}

/** Per-day counts → one entry per calendar month from the first to the last, empty months included (as 0). */
function byMonth(days: { date: string; count: number }[]): MonthCount[] {
  if (days.length === 0) return []
  const totals = new Map<string, number>()
  for (const d of days) totals.set(d.date.slice(0, 7), (totals.get(d.date.slice(0, 7)) ?? 0) + d.count)
  const [fy, fm] = days[0].date.split("-").map(Number)
  const [ly, lm] = days[days.length - 1].date.split("-").map(Number)
  const months: MonthCount[] = []
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    const at = new Date(Date.UTC(y, m - 1, 1))
    months.push({ key, label: MONTH.format(at), long: MONTH_LONG.format(at), count: totals.get(key) ?? 0 })
  }
  return months
}

/** A round top for the scale (1, 2, 5 × 10ⁿ), so the gridlines fall on readable numbers. */
function niceMax(value: number): number {
  if (value <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(value))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step
  return 10 * step
}

/** Monthly columns: thin bars from one baseline, values on the tallest and the latest, every value on hover/focus. */
function MonthChart({ months }: { months: MonthCount[] }) {
  const [active, setActive] = useState<number | null>(null)
  const top = niceMax(Math.max(...months.map((m) => m.count)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f))
  const peak = months.reduce((best, m, i) => (m.count > months[best].count ? i : best), 0)
  const last = months.length - 1
  const every = Math.ceil(months.length / 12) // at most ~12 month names under the axis

  return (
    <div
      className="flex gap-2"
      role="img"
      aria-label={`Documents received per month, ${months[0].long} to ${months[last].long}`}
    >
      {/* y axis: recessive numbers next to faint gridlines */}
      <div className="text-muted-foreground relative h-48 w-8 shrink-0 text-right text-[11px] tabular-nums" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
            {NUMBER.format(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-48">
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn("absolute inset-x-0 border-t", t === 0 ? "border-border" : "border-border/40")}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {months.map((m, i) => {
              const labelled = i === peak || i === last // sparing direct labels; the rest via hover / the table
              const pct = (m.count / top) * 100
              return (
                // the whole column slot is the hit target, not just the painted bar
                <button
                  key={m.key}
                  type="button"
                  aria-label={`${m.long}: ${NUMBER.format(m.count)} documents`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-[1px] outline-none"
                >
                  {m.count > 0 && (
                    <span
                      className={cn(
                        "relative block w-full max-w-6 rounded-t-[4px] transition-opacity",
                        BAR,
                        active !== null && active !== i && "opacity-60",
                        "group-focus-visible:ring-ring group-focus-visible:ring-2",
                      )}
                      style={{ height: `max(${pct}%, 2px)` }}
                    >
                      {labelled && active === null && (
                        <span className="text-foreground absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-medium tabular-nums">
                          {NUMBER.format(m.count)}
                        </span>
                      )}
                    </span>
                  )}
                  {active === i && (
                    <span
                      role="tooltip"
                      className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-y-2 rounded-md border px-2 py-1 text-left whitespace-nowrap shadow-md"
                      style={{ bottom: `${Math.min(pct, 85)}%` }}
                    >
                      <span className="block text-sm font-semibold tabular-nums">{NUMBER.format(m.count)}</span>
                      <span className="text-muted-foreground block text-xs">{m.long}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {/* month names under the axis (thinned when there are many) */}
        <div className="text-muted-foreground mt-1 flex text-[11px]" aria-hidden>
          {months.map((m, i) => (
            <span key={m.key} className="min-w-0 flex-1 truncate text-center">
              {i % every === 0 || i === last ? m.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Every month with its count — the table view (all values readable without hovering). */
function MonthTable({ months }: { months: MonthCount[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Month</th>
            <th className="px-3 py-1.5 text-right font-medium">Documents</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...months].reverse().map((m) => (
            <tr key={m.key}>
              <td className="px-3 py-1.5">{m.long}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{NUMBER.format(m.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Overview → Document count: how many documents DocuSoft holds for the client, received month by month
 * (Json_GetDocumentCountByDate). Read-only.
 */
export function ClientDocumentCount({ clientId, projectId }: { clientId: string; projectId: number }) {
  const counts = useGetDocumentCountsQuery({ clientId, projectId })
  const [view, setView] = useState<"chart" | "table">("chart")

  const allMonths = byMonth(counts.data ?? [])
  const total = (counts.data ?? []).reduce((sum, d) => sum + d.count, 0)
  const chartMonths = allMonths.slice(-MAX_MONTHS)

  return (
    <section className="space-y-3 border-t pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Document count</h2>
          <p className="text-muted-foreground text-xs">Documents DocuSoft holds for this client, by month received.</p>
        </div>
        {allMonths.length > 0 && (
          <div role="tablist" aria-label="Show as" className="bg-muted inline-flex gap-1 rounded-lg p-1 text-xs">
            {(
              [
                ["chart", "Chart"],
                ["table", "Table"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "rounded-md px-2.5 py-0.5",
                  view === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {counts.isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : counts.isError ? (
        <p className="text-destructive text-sm">{errorText(counts.error)}</p>
      ) : allMonths.length === 0 ? (
        <p className="text-muted-foreground text-sm">DocuSoft holds no documents for this client yet.</p>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <p className="text-3xl font-semibold">{NUMBER.format(total)}</p>
            <p className="text-muted-foreground text-xs">
              documents · {allMonths[0].long} – {allMonths[allMonths.length - 1].long}
            </p>
          </div>
          {view === "chart" ? (
            <>
              <MonthChart months={chartMonths} />
              {allMonths.length > MAX_MONTHS && (
                <p className="text-muted-foreground text-xs">
                  The chart shows the last {MAX_MONTHS} months; the table lists them all.
                </p>
              )}
            </>
          ) : (
            <MonthTable months={allMonths} />
          )}
        </div>
      )}
    </section>
  )
}
