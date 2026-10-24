"use client"

import Link from "next/link"

import type { Box, LocationPath } from "@/api/types"
import { StoredLocation } from "@/components/location-path"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { locationText } from "@/domain/location"

const HERO_GRADIENT = "linear-gradient(115deg, #7d0013 0%, #b93c2e 55%, #e4572e 125%)" // same as the dashboard hero

// A rack of four shelves; box widths are fixed so the picture is the same every time. The first `filed` boxes (reading
// shelf by shelf) are drawn solid white — the ones just put away — the rest are faint.
const SHELVES = [
  [46, 30, 54, 38, 46, 30],
  [38, 54, 30, 46, 38, 46],
  [54, 38, 46, 30, 54, 30],
  [30, 46, 38, 54, 30, 46],
]

function RackIllustration({ filed }: { filed: number }) {
  let n = 0
  return (
    <svg viewBox="0 0 420 300" className="h-auto w-full max-w-md" role="img" aria-label="Boxes filed on a rack">
      <defs>
        <radialGradient id="reg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* rack frame */}
      <rect
        x="20"
        y="30"
        width="300"
        height="250"
        rx="14"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2"
      />
      {SHELVES.map((widths, row) => {
        const baseY = 30 + (row + 1) * 62.5
        let x = 34
        return (
          <g key={row}>
            {widths.map((w, i) => {
              const solid = n++ < filed
              const box = (
                <g key={i}>
                  <rect
                    x={x}
                    y={baseY - 44}
                    width={w - 6}
                    height={40}
                    rx="4"
                    fill={solid ? "#fff" : "rgba(255,255,255,0.14)"}
                    stroke={solid ? "none" : "rgba(255,255,255,0.25)"}
                  />
                  {solid && (
                    <rect x={x + 6} y={baseY - 34} width={Math.max(w - 18, 8)} height="6" rx="2" fill="#b93c2e" />
                  )}
                  {solid && (
                    <rect
                      x={x + 6}
                      y={baseY - 22}
                      width={Math.max(w - 26, 6)}
                      height="3"
                      rx="1.5"
                      fill="#b93c2e"
                      opacity="0.45"
                    />
                  )}
                </g>
              )
              x += w
              return box
            })}
            <rect x="26" y={baseY - 3} width="288" height="5" rx="2.5" fill="rgba(255,255,255,0.45)" />
          </g>
        )
      })}
      {/* check badge */}
      <circle cx="338" cy="78" r="70" fill="url(#reg-glow)" />
      <circle cx="338" cy="78" r="40" fill="#fff" />
      <path
        d="M320 79 l12 12 l24 -26"
        fill="none"
        stroke="#b93c2e"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The wizard's last page: a hero with what happened, where every box went, and what to do next. */
export function RegisteredHero({
  boxes,
  placed,
  orderId,
  onRegisterMore,
  onFileRest,
}: {
  boxes: Box[]
  placed: Record<string, LocationPath>
  orderId?: string
  onRegisterMore: () => void
  onFileRest: () => void
}) {
  const filed = boxes.filter((b) => placed[b.id])
  const waiting = boxes.length - filed.length
  const first = boxes[0]
  const last = boxes[boxes.length - 1]

  // Boxes grouped by where they went, in the order they were filed.
  const byLocation = new Map<string, { path: LocationPath; boxes: Box[] }>()
  for (const b of filed) {
    const key = locationText(placed[b.id])
    const group = byLocation.get(key) ?? { path: placed[b.id], boxes: [] }
    group.boxes.push(b)
    byLocation.set(key, group)
  }

  return (
    <div className="space-y-6">
      <section
        aria-label="Registration complete"
        className="relative isolate overflow-hidden rounded-3xl p-6 text-white md:p-10"
        style={{ backgroundImage: HERO_GRADIENT }}
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
          className="pointer-events-none absolute -bottom-40 -left-20 -z-10 size-96 rounded-full bg-white/20 blur-3xl"
          aria-hidden
        />

        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {waiting === 0 ? "Registered and filed" : "Registered"}
            </span>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {boxes.length} box{boxes.length === 1 ? "" : "es"} for {first?.clientName}
            </h1>
            <p className="max-w-[52ch] text-sm text-white/85 md:text-base">
              {waiting === 0
                ? "Every box has a label and a place on the shelf."
                : `${filed.length} filed, ${waiting} still waiting for a position — they show on the dashboard under unallocated boxes.`}
            </p>
            <dl className="flex flex-wrap gap-3 pt-1">
              {[
                ["Box numbers", boxes.length > 1 ? `${first?.boxNumber} – ${last?.boxNumber}` : first?.boxNumber],
                ["Filed", `${filed.length} of ${boxes.length}`],
                ["Shelves used", String(byLocation.size)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/12 px-4 py-2 backdrop-blur-sm">
                  <dt className="text-[11px] tracking-wide text-white/70 uppercase">{label}</dt>
                  <dd className="font-mono text-sm font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={onRegisterMore} className="bg-white text-[#7d0013] hover:bg-white/90">
                Register more boxes
              </Button>
              {waiting > 0 && (
                <Button
                  variant="outline"
                  onClick={onFileRest}
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  File the other {waiting}
                </Button>
              )}
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/app/clients/${first?.clientId}/boxes`} />}
                className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              >
                View the client&apos;s boxes
              </Button>
              {orderId && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/app/orders/${orderId}`} />}
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  Back to the order
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <RackIllustration filed={filed.length} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Where they went</CardTitle>
          </CardHeader>
          <CardContent>
            {byLocation.size === 0 ? (
              <p className="text-muted-foreground text-sm">No box has been filed yet.</p>
            ) : (
              <ul className="divide-y">
                {[...byLocation.values()].map((g) => (
                  <li key={locationText(g.path)} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <StoredLocation path={g.path} className="text-sm" />
                    <span className="flex flex-wrap gap-1">
                      {g.boxes.map((b) => (
                        <Link
                          key={b.id}
                          href={`/app/boxes/${b.id}`}
                          className="bg-muted hover:bg-muted/70 rounded-md px-2 py-0.5 font-mono text-xs"
                        >
                          {b.boxNumber}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Labels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Lost or smudged a label? Print the batch again.</p>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/print/labels?boxIds=${boxes.map((b) => b.id).join(",")}&autoprint=1`} target="_blank" />
              }
            >
              Print labels again
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
