"use client"

import Link from "next/link"
import {
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  PackageOpen,
  PackagePlus,
  Search,
  SearchOff,
  ShieldAlert,
} from "@/components/icons"
import type { AppIcon } from "@/components/icons"

import { useAuth } from "@/auth/useAuth"
import { can, type Permission } from "@/domain/permissions"
import { useWarehouses } from "@/api/warehouses"
import { useOrderSearch } from "@/api/orders"
import { useBoxSearch } from "@/api/boxes"
import { useAuditSearch } from "@/api/audit"
import { ORDER_TYPE_META } from "@/domain/status"
import { capacityLevel, capacityPercent } from "@/lib/capacity"
import { formatDate } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { AuditTimeline } from "@/components/audit-timeline"
import { Skeleton } from "@/components/ui/skeleton"
import { StaffUpdates } from "@/staff/features/dashboard/staff-updates"

// Only the latest few events live on the dashboard (so the page stays short); the full history is the Audit log.
const RECENT_ACTIVITY_COUNT = 6

// --- Quick actions (inside the hero) ---------------------------------------

interface QuickAction {
  href: string
  label: string
  hint: string
  icon: AppIcon
  /** Hidden from users without it (e.g. auditors only get "Find a box"). */
  permission?: Permission
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/app/boxes/new",
    label: "Register boxes",
    hint: "Add boxes & print labels",
    icon: PackagePlus,
    permission: "boxes.operate",
  },
  {
    href: "/app/boxes/receive",
    label: "Goods-In",
    hint: "Scan arriving boxes",
    icon: ORDER_TYPE_META.collection.icon,
    permission: "boxes.operate",
  },
  {
    href: "/app/boxes/put-away",
    label: "Put away",
    hint: "Scan box, then slot",
    icon: ORDER_TYPE_META.dispatch.icon,
    permission: "boxes.operate",
  },
  {
    href: "/app/orders/new?type=collection",
    label: "Collection order",
    hint: "Bring boxes in",
    icon: ORDER_TYPE_META.collection.icon,
    permission: "orders.operate",
  },
  {
    href: "/app/orders/new?type=dispatch",
    label: "Dispatch order",
    hint: "Send boxes out",
    icon: ORDER_TYPE_META.dispatch.icon,
    permission: "orders.operate",
  },
  {
    href: "/app/orders/new?type=destruction",
    label: "Destruction order",
    hint: "Destroy boxes",
    icon: ORDER_TYPE_META.destruction.icon,
    permission: "orders.operate",
  },
  {
    href: "/app/orders/new?type=digitize",
    label: "Digitize order",
    hint: "Scan boxes",
    icon: ORDER_TYPE_META.digitize.icon,
    permission: "orders.operate",
  },
  { href: "/app/boxes", label: "Find a box", hint: "Search or scan", icon: Search },
]

function QuickActionTile({ action }: { action: QuickAction }) {
  const Icon = action.icon
  return (
    <Link
      href={action.href}
      className="group flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm transition-all outline-none hover:-translate-y-0.5 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#b93c2e]">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{action.label}</span>
        <span className="block truncate text-xs text-white/75">{action.hint}</span>
      </span>
    </Link>
  )
}

// --- Needs attention -------------------------------------------------------

type Tone = "warning" | "info" | "danger"

const TONE: Record<Tone, { chip: string; accent: string; value: string }> = {
  warning: {
    chip: "bg-status-pending-destruction/15 text-status-pending-destruction",
    accent: "bg-status-pending-destruction",
    value: "text-foreground",
  },
  info: { chip: "bg-status-reserved/15 text-status-reserved", accent: "bg-status-reserved", value: "text-foreground" },
  danger: { chip: "bg-status-hold/15 text-status-hold", accent: "bg-status-hold", value: "text-status-hold" },
}

function StatCard({
  href,
  label,
  count,
  icon: Icon,
  tone,
  loading,
}: {
  href: string
  label: string
  count: number | undefined
  icon: AppIcon
  tone: Tone
  loading: boolean
}) {
  const active = (count ?? 0) > 0
  const styles = TONE[tone]

  return (
    <Link
      href={href}
      className="bg-card hover:border-foreground/20 focus-visible:ring-ring group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 pl-5 transition-all outline-none hover:shadow-sm focus-visible:ring-2"
    >
      {/* a coloured edge only on the cards that need someone to act */}
      <span className={cn("absolute inset-y-0 left-0 w-1", active ? styles.accent : "bg-transparent")} aria-hidden />
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          active ? styles.chip : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-8 w-10" />
        ) : (
          <span
            className={cn(
              "block text-3xl leading-none font-semibold tracking-tight tabular-nums",
              active ? styles.value : "text-muted-foreground",
            )}
          >
            {count ?? 0}
          </span>
        )}
        <span className="text-muted-foreground mt-1 block text-sm leading-tight">{label}</span>
      </span>
      {!loading && !active ? (
        <span className="bg-status-stored/15 text-status-stored flex size-6 shrink-0 items-center justify-center rounded-full">
          <Check className="size-4" aria-label="Nothing to do" />
        </span>
      ) : (
        <ArrowRight
          className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </Link>
  )
}

// --- Warehouse capacity ----------------------------------------------------

const LEVEL_COLOR: Record<ReturnType<typeof capacityLevel>, string> = {
  good: "var(--status-stored)",
  warning: "var(--status-pending-destruction)",
  critical: "var(--status-hold)",
}

/** A donut that shows how full a warehouse is; the colour follows the same thresholds as every capacity bar. */
function CapacityRing({ percent, level }: { percent: number; level: ReturnType<typeof capacityLevel> }) {
  return (
    <div
      className="relative flex size-20 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${LEVEL_COLOR[level]} ${Math.min(percent, 100) * 3.6}deg, var(--muted) 0)` }}
      role="img"
      aria-label={`${percent}% full`}
    >
      <div className="bg-card flex size-[3.75rem] items-center justify-center rounded-full">
        <span className="text-lg font-semibold tabular-nums">{percent}%</span>
      </div>
    </div>
  )
}

function WarehouseCard({
  href,
  code,
  name,
  used,
  total,
  racks,
  slots,
}: {
  href: string
  code: string
  name: string
  used: number
  total: number
  racks: number
  slots: number
}) {
  const percent = capacityPercent(used, total)
  const level = capacityLevel(used, total)
  return (
    <Link
      href={href}
      className="bg-card hover:border-foreground/20 focus-visible:ring-ring flex items-center gap-4 rounded-2xl border p-4 transition-all outline-none hover:shadow-sm focus-visible:ring-2"
    >
      <CapacityRing percent={percent} level={level} />
      <div className="min-w-0 flex-1">
        <span className="bg-muted text-muted-foreground inline-block rounded px-1.5 py-0.5 font-mono text-[11px]">
          {code}
        </span>
        <p className="mt-1 truncate font-semibold">{name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
          {used.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")} cm
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {racks} rack{racks === 1 ? "" : "s"} · {slots} slots
        </p>
      </div>
    </Link>
  )
}

function formatToday() {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date())
  return `${weekday}, ${formatDate(new Date().toISOString())}`
}

export function StaffDashboardScreen() {
  const { user } = useAuth()
  const { data: warehouses, isLoading: loadingWarehouses } = useWarehouses()
  const { data: needsApproval, isLoading: l1 } = useOrderSearch({ status: ["requested"], pageSize: 1 })
  const { data: scheduled, isLoading: l2 } = useOrderSearch({
    status: ["scheduled", "approved", "in_progress"],
    pageSize: 1,
  })
  const { data: unallocated, isLoading: l3 } = useBoxSearch({ status: ["unallocated"], pageSize: 1 })
  const { data: onHold, isLoading: l4 } = useBoxSearch({ onHold: true, pageSize: 1 })
  const { data: missing, isLoading: l5 } = useBoxSearch({ status: ["missing"], pageSize: 1 })
  const { data: recentActivity, isLoading: loadingActivity } = useAuditSearch({ pageSize: RECENT_ACTIVITY_COUNT })

  const totalUsed = warehouses?.reduce((sum, w) => sum + w.usedCapacity, 0) ?? 0
  const totalCapacity = warehouses?.reduce((sum, w) => sum + w.totalCapacity, 0) ?? 0
  const overallPercent = capacityPercent(totalUsed, totalCapacity)
  const overallLevel = capacityLevel(totalUsed, totalCapacity)
  const canReadAudit = can(user?.roles, "audit.read") // the Audit log page needs it
  const quickActions = QUICK_ACTIONS.filter((a) => !a.permission || can(user?.roles, a.permission))

  // One sentence under the greeting: what is waiting right now.
  const waiting = [
    (needsApproval?.total ?? 0) > 0 &&
      `${needsApproval?.total} order${needsApproval?.total === 1 ? "" : "s"} to approve`,
    (onHold?.total ?? 0) > 0 && `${onHold?.total} box${onHold?.total === 1 ? "" : "es"} on hold`,
    (missing?.total ?? 0) > 0 && `${missing?.total} missing`,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Hero: who is here, what is waiting, and the shortcuts */}
      <section
        aria-label="Welcome"
        className="relative isolate overflow-hidden rounded-3xl p-6 text-white md:p-8"
        style={{ backgroundImage: "linear-gradient(115deg, #7d0013 0%, #b93c2e 55%, #e4572e 125%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14]"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(100deg, transparent 15%, #000 100%)",
            WebkitMaskImage: "linear-gradient(100deg, transparent 15%, #000 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute -top-32 -right-20 -z-10 size-96 rounded-full bg-white/25 blur-3xl"
          aria-hidden
        />

        <div className="grid items-center gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="space-y-3">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {formatToday()}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {user ? `Welcome back, ${user.name}` : "Welcome back"}
            </h1>
            <p className="max-w-[46ch] text-sm text-white/80">
              {waiting.length > 0
                ? `Waiting for you: ${waiting.join(" · ")}.`
                : "Nothing is waiting for you right now."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <QuickActionTile key={action.href} action={action} />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="needs-attention" className="space-y-3">
        <h2 id="needs-attention" className="text-sm font-semibold">
          Needs attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            href="/app/orders?tab=needs-approval"
            label="Awaiting approval"
            count={needsApproval?.total}
            icon={ClipboardCheck}
            tone="warning"
            loading={l1}
          />
          <StatCard
            href="/app/orders?tab=scheduled"
            label="Scheduled / in progress"
            count={scheduled?.total}
            icon={CalendarClock}
            tone="info"
            loading={l2}
          />
          <StatCard
            href="/app/boxes?status=unallocated"
            label="Unallocated boxes"
            count={unallocated?.total}
            icon={PackageOpen}
            tone="warning"
            loading={l3}
          />
          <StatCard
            href="/app/boxes?onHold=true"
            label="Boxes on hold"
            count={onHold?.total}
            icon={ShieldAlert}
            tone="danger"
            loading={l4}
          />
          <StatCard
            href="/app/boxes?missing=true"
            label="Missing boxes"
            count={missing?.total}
            icon={SearchOff}
            tone="danger"
            loading={l5}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="capacity" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="capacity" className="text-sm font-semibold">
              Warehouse capacity
            </h2>
            {warehouses && totalCapacity > 0 && (
              <p className="text-muted-foreground text-xs tabular-nums">
                {totalUsed.toLocaleString("en-GB")} / {totalCapacity.toLocaleString("en-GB")} cm used overall
              </p>
            )}
          </div>

          {warehouses && totalCapacity > 0 && (
            <div className="bg-card rounded-2xl border p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">All warehouses</span>
                <span className="text-2xl font-semibold tabular-nums">{overallPercent}%</span>
              </div>
              <div className="bg-muted mt-2 h-2.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(overallPercent, 100)}%`, background: LEVEL_COLOR[overallLevel] }}
                />
              </div>
            </div>
          )}

          {loadingWarehouses ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : warehouses && warehouses.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {warehouses.map((w) => (
                <WarehouseCard
                  key={w.id}
                  href={`/app/warehouses/${w.id}`}
                  code={w.code}
                  name={w.name}
                  used={w.usedCapacity}
                  total={w.totalCapacity}
                  racks={w.rackCount}
                  slots={w.slotCount}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No warehouses yet.</p>
          )}
        </section>

        <div className="space-y-6">
          <StaffUpdates />
          <section aria-labelledby="recent-activity" className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <h2 id="recent-activity" className="text-sm font-semibold">
                Recent activity
              </h2>
              {canReadAudit && (
                <Link href="/app/audit" className="text-primary text-xs underline-offset-4 hover:underline">
                  View all
                </Link>
              )}
            </div>
            <div className="bg-card rounded-2xl border p-4">
              {loadingActivity ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <AuditTimeline events={recentActivity?.items ?? []} orderHref={(id) => `/app/orders/${id}`} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
