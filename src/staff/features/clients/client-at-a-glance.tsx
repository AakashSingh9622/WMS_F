"use client"

import type { ReactNode } from "react"

import { useCharges, useClientAccount } from "@/api/billing"
import { useClientStats } from "@/api/clients"
import { useCan } from "@/auth/useAuth"
import {
  ArrowUpFromLine,
  CalendarClock,
  ClipboardList,
  DocumentScanner,
  Invoice,
  Package,
  ScrollText,
  TriangleAlertIcon,
  Users,
  Warehouse,
  type AppIcon,
} from "@/components/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { useClientCard } from "@/hooks/useClientCard"
import { formatDate, formatMoney, formatRelativeTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { thisYear } from "@/staff/features/billing/period-picker"
import { useGetClientActivityQuery, useGetDocumentCountsQuery } from "@/store/docusoftApi"

const NUMBER = new Intl.NumberFormat("en-GB")
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })

type Tone = "default" | "alert"

/**
 * One metric: icon, label, the value, a short line under it. `zero` makes a nothing-to-report value quieter, so the
 * real numbers stand out; `loading` keeps the tile's place while its data comes.
 */
function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  zero,
  loading,
}: {
  icon: AppIcon
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  zero?: boolean
  loading?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg p-3",
        tone === "alert" ? "bg-status-hold/10 ring-status-hold/30 ring-1" : "bg-muted/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md",
          tone === "alert" ? "bg-status-hold/15 text-status-hold" : "bg-background text-primary shadow-xs",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-[11px] font-medium tracking-wide uppercase">{label}</p>
        {loading ? (
          <Skeleton className="my-1 h-6 w-16" />
        ) : (
          <p
            className={cn(
              "truncate text-xl leading-tight font-semibold",
              tone === "alert" && "text-status-hold",
              zero && tone !== "alert" && "text-muted-foreground",
            )}
          >
            {value}
          </p>
        )}
        {sub && !loading && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  )
}

/** A group of metrics in its own card, so the three groups can sit side by side. */
function Panel({
  title,
  icon: Icon,
  grid,
  className,
  children,
}: {
  title: string
  icon: AppIcon
  grid: string // the tiles' grid columns at each width
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("bg-card space-y-3 rounded-xl border p-3", className)}>
      <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold">
        <Icon className="text-muted-foreground size-4" aria-hidden />
        {title}
      </h3>
      <div className={cn("grid gap-2", grid)}>{children}</div>
    </div>
  )
}

/** The billing metrics — only for people who may see billing (their own calls run only then). */
function BillingMetrics({
  clientId,
  balance,
  overdue,
  statsLoading,
}: {
  clientId: string
  balance?: number
  overdue?: number
  statsLoading: boolean
}) {
  const period = thisYear()
  const account = useClientAccount(clientId, period) // same call as the Billing tab
  const open = useCharges({ clientId, status: "open", pageSize: 1 }) // only the total is used
  const s = account.data?.summary
  return (
    <Panel title="Billing" icon={Invoice} grid="sm:grid-cols-2">
      {!account.isError && (
        <Metric
          icon={Invoice}
          label={`Revenue ${period.from.slice(0, 4)}`}
          value={formatMoney(s?.invoiced ?? 0)}
          zero={(s?.invoiced ?? 0) === 0}
          sub={
            s
              ? `${NUMBER.format(s.invoices)} invoice${s.invoices === 1 ? "" : "s"} · ${NUMBER.format(s.paidInvoices)} paid`
              : undefined
          }
          loading={account.isLoading}
        />
      )}
      {(statsLoading || balance !== undefined) && (
        <Metric
          icon={ScrollText}
          label="Balance owed"
          value={formatMoney(balance ?? 0)}
          zero={(balance ?? 0) === 0}
          sub="Still to pay, from Sage"
          loading={statsLoading}
        />
      )}
      {(statsLoading || overdue !== undefined) && (
        <Metric
          icon={TriangleAlertIcon}
          label="Overdue"
          value={formatMoney(overdue ?? 0)}
          zero={(overdue ?? 0) === 0}
          sub={(overdue ?? 0) > 0 ? "Past its due date" : "Nothing overdue"}
          tone={(overdue ?? 0) > 0 ? "alert" : "default"}
          loading={statsLoading}
        />
      )}
      {!open.isError && (
        <Metric
          icon={ClipboardList}
          label="Not invoiced yet"
          value={formatMoney(open.data?.amount ?? 0)}
          zero={(open.data?.amount ?? 0) === 0}
          sub={
            open.data ? `${NUMBER.format(open.data.total)} open charge${open.data.total === 1 ? "" : "s"}` : undefined
          }
          loading={open.isLoading}
        />
      )}
    </Panel>
  )
}

/**
 * Overview → At a glance: the client in numbers — what the warehouse holds, what DocuSoft holds, and (for billing
 * users) what it's billed and owes. Every figure comes from data the app already loads (client stats, the DocuSoft
 * client card, document counts, the Billing tab's account); a figure whose source isn't available is left out, never
 * shown as a made-up zero.
 */
export function ClientAtAGlance({ clientId, projectId }: { clientId: string; projectId: number }) {
  const seesBilling = useCan("billing.view")
  const stats = useClientStats() // shared with the Clients list (one call for every client, cached)
  const { contacts } = useClientCard(clientId) // already loaded for this page
  const docs = useGetDocumentCountsQuery({ clientId, projectId }) // shared with Document count below
  const activity = useGetClientActivityQuery(clientId) // shared with Activity → DocuSoft

  const mine = stats.data?.items.find((r) => r.clientId === clientId)
  const statsLoading = stats.isLoading

  // Last activity: the latest of the warehouse's own log and DocuSoft's.
  const lastWarehouse = mine?.lastActivityAt
  const lastDocusoft = activity.data?.[0]?.at || undefined
  const last = [lastWarehouse, lastDocusoft].filter(Boolean).sort().pop()
  const lastWhere = !last ? "" : last === lastDocusoft && last !== lastWarehouse ? "in DocuSoft" : "in the warehouse"

  const totalDocs = (docs.data ?? []).reduce((sum, d) => sum + d.count, 0)
  const lastDoc = docs.data?.[docs.data.length - 1]?.date
  const portalUsers = contacts.filter((c) => c["Portal User"] === true).length

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">At a glance</h2>
        <p className="text-muted-foreground text-xs">This client in numbers, from the warehouse and DocuSoft.</p>
      </div>

      <div
        className={cn(
          "grid items-stretch gap-3",
          seesBilling
            ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)]"
            : "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
        )}
      >
        <Panel title="Warehouse" icon={Warehouse} grid="sm:grid-cols-2">
          {!stats.isError && (
            <>
              <Metric
                icon={Package}
                label="Boxes held"
                value={NUMBER.format(mine?.boxes ?? 0)}
                zero={(mine?.boxes ?? 0) === 0}
                sub={`${NUMBER.format(mine?.inStorage ?? 0)} in storage`}
                loading={statsLoading}
              />
              <Metric
                icon={ArrowUpFromLine}
                label="With the client"
                value={NUMBER.format(mine?.out ?? 0)}
                zero={(mine?.out ?? 0) === 0}
                sub="Sent out, not back yet"
                loading={statsLoading}
              />
              <Metric
                icon={Warehouse}
                label="Open orders"
                value={NUMBER.format(mine?.openOrders ?? 0)}
                zero={(mine?.openOrders ?? 0) === 0}
                sub={(mine?.openOrders ?? 0) === 0 ? "Nothing in progress" : "Still in progress"}
                loading={statsLoading}
              />
            </>
          )}
          {(statsLoading || activity.isLoading || last) && (
            <Metric
              icon={CalendarClock}
              label="Last activity"
              value={last ? formatRelativeTime(last) : "—"}
              sub={last ? `${formatDate(last.slice(0, 10))} · ${lastWhere}` : undefined}
              loading={!last && (statsLoading || activity.isLoading)}
            />
          )}
        </Panel>

        <Panel title="DocuSoft" icon={DocumentScanner} grid="sm:grid-cols-2 xl:grid-cols-1">
          {!docs.isError && (
            <Metric
              icon={DocumentScanner}
              label="Documents"
              value={NUMBER.format(totalDocs)}
              zero={totalDocs === 0}
              sub={lastDoc ? `Latest received ${MONTH.format(new Date(`${lastDoc}T00:00:00Z`))}` : "None received yet"}
              loading={docs.isLoading}
            />
          )}
          <Metric
            icon={Users}
            label="Contacts"
            value={NUMBER.format(contacts.length)}
            zero={contacts.length === 0}
            sub={`${NUMBER.format(portalUsers)} with portal access`}
          />
        </Panel>

        {seesBilling && (
          <BillingMetrics
            clientId={clientId}
            balance={mine?.balance}
            overdue={mine?.overdue}
            statsLoading={statsLoading}
          />
        )}
      </div>
    </section>
  )
}
