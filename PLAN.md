# Plan

Full spec: `docs/spec.md`. Stack, folder conventions, and the Vite→Next.js routing translation: `CLAUDE.md`.

## Stack decisions beyond the spec's list

- Next.js 16 App Router instead of Vite + React Router (repo was already scaffolded this way; see
  `CLAUDE.md` → "Routing" for the full translation).
- shadcn's `base-nova` style ships `Field`/`FieldGroup`/`FieldLabel`/`FieldError` instead of the older
  `Form`/`FormField` wrapper — used directly with react-hook-form's `register`/`formState.errors`, no extra
  wrapper needed.
- `next-themes` for the light/dark toggle (pulled in automatically by `shadcn init`).
- Session token is mock-only base64url JSON (not a real JWT) — see `CLAUDE.md` → "Auth (mock)".

## Assumptions (spec §12)

Carried over as-is from the spec — see `docs/spec.md` §12. Nothing changed yet.

## Phase status

### 1. Foundation — done
- Dependencies: TanStack Query/Table, react-hook-form + zod, MSW, JsBarcode, shadcn/ui (`base-nova`), Vitest +
  Testing Library, Prettier.
- Theme tokens: staff (teal) / portal (violet) accents via `.side-staff`/`.side-portal`, box-status color
  tokens, light/dark via existing shadcn CSS variables.
- `src/core/providers.tsx` (QueryClientProvider, MSW bootstrap gate, ThemeProvider, AuthProvider, Tooltip,
  Toaster), `src/proxy.ts` (coarse auth guard), `src/auth/session.ts` (server) + `src/auth/useAuth.tsx`
  (client).
- Full route skeleton for every path in spec §2 as stub pages (`RouteStub`), including nested-tab layouts for
  box detail and client detail, the settings left-nav layout, and all `/print/*` routes.
- Login (real, per spec §7) + forgot-password (UI only) + `/403` + `not-found.tsx`.
- `src/mocks/` — MSW handlers for `/auth/login`, `/auth/logout`, `/auth/me` and the 4 seeded demo users.
  Full seed volume (warehouses/boxes/orders/clients) lands with those features in later phases.
- `src/api/types.ts` — full domain model + zod schemas from spec §3.
- ESLint `no-restricted-imports` override so `src/staff/`, `src/portal/`, `src/print/` (and their route
  folders) can't import each other.

**Not done yet (later phases, per spec §11):** TanStack Table, JsBarcode usage, `useBarcodeScanner`,
`orderMachine.ts`, full seed data, Playwright *specs*. Empty/loading/error states are only built per-screen as
each screen is built, not for the stub pages.

**Verified in a real browser** (Chromium via Playwright, driven with a throwaway script — no spec files
committed, that's still Phase 8): unauthenticated `/` → `/login`; login page lists the 4 demo accounts;
`admin@demo.test` → `/app` with the full staff sidebar incl. Audit log; `operator@demo.test` (staff_operator)
has Audit log hidden from its sidebar *and* is redirected to `/403` when hitting `/app/settings/users`
directly; `client@demo.test` → `/portal` with the portal top nav, and hitting `/app/boxes` bounces back to
`/portal`; an unknown path under an authenticated session renders `not-found.tsx`. `@playwright/test` +
Chromium got installed during this to enable the check — already part of the spec's stack, just arriving
earlier than its Phase 8 slot.

**Gotcha worth knowing:** MSW's `worker.start()` must be called at most once — React Strict Mode (dev only)
double-invokes effects, and a second `start()` throws ("cannot configure an already enabled network"),
which silently left `MockGate` stuck with `ready: false` forever (nothing under it ever rendered — no
console error pointed at the actual cause). Fixed with a module-scoped singleton promise in
`src/core/mock-gate.tsx` (`ensureWorkerStarted()`) so repeated effect runs share one `start()` call.

### 2. Locations — done
- `src/mocks/prng.ts` (deterministic mulberry32) + `src/mocks/seed/locations.ts`: 2 warehouses (8 + 6 racks),
  4×6 slots/rack, capacity 10 units/slot, ~4% blocked, some full/empty/partial — matches spec §6's shape for
  the location hierarchy (box-backed capacity numbers arrive with the box seed in Phase 3/4, not yet real).
- `src/mocks/store.ts`: in-memory + localStorage-persisted mock state, versioned (bump `SEED_VERSION` on any
  seed shape change so stale localStorage data doesn't silently mismatch new types), with `updateSlot()`
  recomputing rack/warehouse aggregates.
- MSW handlers split into `src/mocks/handlers/{auth,locations}.ts`, combined in `handlers.ts`. Added
  `GET /warehouses(/:id)`, `GET /warehouses/:id/racks`, `GET /racks/:id(/slots)`, `PATCH /slots/:id`,
  `POST /mock/reset`.
- `src/api/client.ts` (fetch wrapper + `ApiError` + zod `parse()` helper), `src/api/query-keys.ts`,
  `src/api/warehouses.ts` (hooks: `useWarehouses`, `useWarehouse`, `useWarehouseRacks`, `useRack`,
  `useRackSlots`, `useUpdateSlot`).
- `src/lib/capacity.ts` (percent/level math), `src/components/{capacity-bar,location-path,slot-grid}.tsx`
  (`SlotGrid` is keyboard-navigable with a proper `grid`/`gridcell` role per spec §9, roving tabindex, arrow
  keys + Enter).
- Real screens replacing stubs: Warehouses list, Warehouse overview (rack cards + capacity), Rack detail (slot
  grid + side panel; staff_admin can block/unblock a slot and edit its capacity, guarded against going below
  current usage), Settings → Warehouse layout (links into rack detail for the actual editing). Settings →
  Profile also got a real "Reset demo data" button (mock mode only, spec §6/§7).

**Simplified vs. the full spec for now:** warehouse-layout settings doesn't have its own standalone
CRUD-everything UI — block/unblock and capacity editing live on the rack detail page's slot panel, and
Settings just links there. Revisit if a dedicated bulk-edit screen turns out to be needed.

**Critical bug found and fixed:** MSW's browser worker cannot read the `Cookie` request header at all — it's
a browser-enforced forbidden header, never exposed to a Service Worker's intercepted `Request`. This meant
`GET /auth/me` returned 401 on *every hard navigation/refresh* (session looked "lost": sidebar items and
role-gated UI silently disappeared), even though the cookie was genuinely set — only degraded once
Playwright's `page.goto()`/`page.reload()` forced a real navigation, so it wasn't visible from Phase 1's
softer client-side-navigation-only test. Fixed by reading `document.cookie` directly in the handler instead
of `request.headers.get("cookie")` — handler resolvers run in the page's main thread (msw/browser forwards
fetch events there), so `document` is genuinely available. See `src/mocks/handlers/auth.ts`. `src/proxy.ts`
is unaffected — it uses `NextRequest.cookies`, a real server-side API backed by the actual HTTP request, not
this browser/Service-Worker path.

**Verified in a real browser:** warehouses list shows both seeded warehouses with capacity bars → warehouse
overview shows all rack cards (8 for WH1) → rack detail renders a real 4×6 (24-cell) grid → clicking a slot
opens its side panel with live data → staff_admin blocking a slot updates the grid immediately → the block
survives a full page reload (localStorage) → Settings → Warehouse layout shows the same real data. Re-ran
Phase 1's guard checks too (including a reload mid-session, which is what caught the cookie bug above) — all
still pass.

### 3–7 (combined pass, ahead of strict phase order — user wanted the whole app clickable against mock data)

The user asked for every tab to work against real mock/localStorage data (not stubs) so they can try the whole
app while the real backend is being built, rather than waiting through phases 3→7 one at a time. This pass
covers most of spec §11 phases 3–7's *screens*, built breadth-first on top of the full mock dataset — deep
write-flows (wizards, pick/receive scanning, order state transitions) are still deferred; see "Not done" below.

**Full mock dataset** (`src/mocks/seed/`): 25 clients with grouped attributes, ~1,200 boxes (real box-backed
slot usage — replaces Phase 2's synthetic slot fill), ~90 orders across all 3 types with lines, and a
per-box audit trail. Detail in `CLAUDE.md` → "Seed data".

**`describeAuditEvent`** (`src/domain/audit.ts`) — the spec §5 sentence builder, one function, unit-tested for
every event type in both staff and client wording (`audit.test.ts`, 23 tests).

**Screens built (real data, no stubs):**
- Staff dashboard — capacity, needs-attention counts, recent activity, quick actions.
- Find a box — search/filter (debounced, URL-persisted), `DataTable` (TanStack Table v9) with sortable
  columns + persisted column visibility.
- Box detail — real header (status/hold/label/open-order banner) + Overview (grouped fields, last 5 events) +
  History (filter by type/order, CSV export) + Orders tabs.
- Clients list + detail — Overview (dynamic attributes grouped by `group`, per spec §3 — adding an attribute
  in the seed needs no frontend change), Boxes/Orders/Activity/Users tabs.
- Orders list (status tabs) + detail (lines table, `StatusStepper`, authorisation/collection side panels,
  activity feed, print-document links) — read-only, no action buttons yet (see "Not done").
- Global audit log (staff_admin) — client filter, CSV export.
- Portal: dashboard (plain-language stats, needs-authorisation banner), inventory list + box detail (client
  wording via `describeAuditEvent(..., "client")`, no rack/slot codes), orders list + detail, settings.

**Not done (still deferred to their own pass):** Register-boxes wizard, Move box, Orders "new" wizard (staff
and portal), Pick/Receive scanning screens, `useBarcodeScanner`, `orderMachine.ts` and any order *action*
(approve/schedule/dispatch/destroy/cancel — everything here is read-only), print documents (still stubs),
Settings → labels/orders/users, box edit/hold actions. Box statuses `picked`/`pending_destruction` aren't
seeded for the same reason (see `CLAUDE.md`).

**Two real bugs found and fixed:**

1. **MSW mock API paths collided with page routes.** The mock's `/portal/orders` handler and the Next.js page
   at `/portal/orders` shared the exact same URL. MSW's Service Worker intercepts full browser *navigations*,
   not just `fetch()` calls — so navigating to the `/portal/orders` page got hijacked and rendered the raw
   JSON API response instead of the page. Fixed by moving every mock endpoint (and every real call site) under
   `/api/*` — see `CLAUDE.md` → "API paths". This is a permanent convention now, not a one-off patch.
2. **Base UI `nativeButton` warning on every `Button` + `Link` combo.** `<Button render={<Link .../>}>` needs
   `nativeButton={false}` since the rendered element (`<a>`) isn't a real `<button>` — otherwise Base UI logs
   an accessibility warning on every render. Fixed at all 9 call sites; noted in `CLAUDE.md` for new ones.

**Verified in a real browser** (Playwright, full flow: login as each demo user → dashboard → find a box →
search → box detail → history → orders tab → clients list → client detail → boxes/activity tabs → orders list
→ order detail → audit log → portal dashboard → portal inventory → portal box detail → portal orders →
portal isolation check with a different client's box ID) — 21/21 checks pass. Also re-ran Phase 1/2's guard
and slot-grid checks — unaffected.

**Test-methodology note, not a product bug:** several of the above checks initially failed because
`page.waitForLoadState('networkidle')` resolves *before* a client-side (SPA) route transition's data fetch
even starts — there's a brief gap between the URL changing and the new page's `useQuery` firing, and
"networkidle" doesn't know to wait for it. Switched those checks to `waitForSelector` for real content
instead. Worth remembering if this app ever gets a committed Playwright suite (spec's own Phase 8).

### 8

Not started (dark-mode already effectively covered since light is now the default with a working toggle;
tablet-layout and the Playwright suite itself remain).

## Seed data size (post-Phase-3 adjustment)

The user asked to shrink the mock dataset so it's actually manageable to click through in a demo — traded
spec §6's ~25 clients / ~1,200 boxes scale for **6 clients, ~16–24 boxes each (~110–130 total), ~21 orders**.
Warehouses/racks/slots stayed the same size (2 warehouses, 14 racks, 336 slots) since that's a fixed grid, not
a scrolling list — reducing it wasn't the complaint. `client-1`/`client-2` are still Acme/Globex, so the
seeded demo users (`client@demo.test`, `viewer@demo.test`) keep pointing at real clients. `SEED_VERSION`
bumped to 3 so old localStorage data regenerates instead of mismatching.

## Order lifecycle — now live (write actions, not just read-only views)

The user specifically wanted to demo the real process: a client requests an order from the portal, it shows
up for staff to approve, and staff can drive it through to completion — all actually mutating the mock
dataset (not just displaying seeded orders). This is spec §4 implemented as live mutations rather than
static seed data, on top of the read-only Orders screens from the earlier pass.

**`src/mocks/orderMachine.ts`** — the state machine from spec §4 (`requested → approved → scheduled →
in_progress → completed`, `rejected` only from `requested`, `cancelled` any time before `completed`).
`assertTransition()` throws a typed error on an illegal move; every mutation in `store.ts` goes through it.

**`src/domain/orders.ts`** — `getBoxIneligibilityReason(box, type)` (on-hold / already-on-an-order / wrong
status, used by `BoxPicker` to show *why* a box can't be added, live, per spec §7) and `getOrderActions(order)`
(which action buttons the staff order-detail screen shows, derived from `canTransition` + order type/state).

**`src/mocks/store.ts`** additions — `createOrder`, `approveOrder`, `rejectOrder`, `scheduleOrder`,
`startOrder`, `cancelOrder`, `dispatchOrder`, `authoriseDestruction`, `destroyOrder`, `completeOrder`. Each
one validates the transition, mutates affected boxes (`reserved` on add, `out`/`destroyed` + slot capacity
freed via `releaseBoxSlot()` on dispatch/destroy, back to `stored` on reject/cancel), and appends real
`AuditEvent`s (`appendAuditEvent()`, reusing the seed's `VISIBLE_TO_CLIENT` map) — so a live order's box
history reads exactly like a seeded one. New orders/audit events continue the seed's id/order-number
sequence (`orderSeq`/`nextOrderIdSeq`/`nextAuditIdSeq`, persisted in the store) instead of colliding with it.

**Endpoints**: `POST /api/orders` (staff create, starts `approved`), `POST /api/portal/orders` (portal
create, starts `requested`, boxIds checked against the session's own client), plus the per-action endpoints
on both (`/approve`, `/reject`, `/schedule`, `/start`, `/cancel`, `/dispatch`, `/authorise-destruction`,
`/destroy`, `/complete`; portal only exposes `/cancel` — restricted to `requested` status — and
`/authorise-destruction`).

**Screens**: `BoxPicker` (`src/components/box-picker.tsx`, shared by both wizards) — search + checkbox list,
ineligible boxes shown disabled with their reason. Staff "Create order" (`/app/orders/new`, type → client →
type-specific fields → box picker → submit) and portal "Request an order" (`/portal/orders/new`, same shape
minus the client picker, plus the destruction authorisation checkbox+typed-name). Staff order detail now has
real `OrderActions` (`src/staff/features/orders/order-actions.tsx`) — Approve/Reject/Schedule/Start/Dispatch/
Record authorisation/Mark destroyed/Complete/Cancel, shown conditionally, each a small dialog where input is
needed (reason, recipient name, method, witness). Portal order detail got a Cancel button (while `requested`)
and an authorisation card (if destruction and not yet authorised).

**Simplified vs. the full spec**: no separate scanner-based Pick screen or intermediate `picked` box/line
status — "Start" moves straight to `in_progress`, and Dispatch/Destroy mark every line done in one action
rather than one-at-a-time scanning. Collection orders don't integrate with the Register-boxes wizard (that's
still its own unbuilt feature) — completing one just closes it out. Role-gating on order actions (e.g.
restricting "Record authorisation" to staff_admin) isn't modeled — any staff role can drive any action.

**Verified in a real browser, full round trip, 10/10**: portal client picks boxes and requests a dispatch →
staff sees it in Orders → Needs approval → Approve → Schedule → Start picking → Dispatch (recipient name) →
order status reaches Completed → the dispatched box's own detail page now shows status **Out**. Separately:
portal requests + self-authorises a destruction order → staff Approve → Schedule → Start → Mark destroyed →
order Completed. Both flows mutate real data — reload the page and it's still there (localStorage).

## Register Boxes wizard + box detail actions + slot suggestions — now live

The user pointed out that creating an order never asked which warehouse to store boxes in — correctly,
because that's a different screen (spec §7 "Register boxes") that didn't exist yet. Built it, plus the box
detail actions that were previously just badges with no way to act on them.

**`src/domain/slotSuggestion.ts`** — mock implementation of spec §6's scoring rules: previous slot first (if
given and has room), same-rack-as-this-client's-other-boxes, minimal wasted space, never blocked/full/
insufficient. Returns top 5 with plain-language reasons. The real backend should replace this file, not the
call sites.

**`src/mocks/store.ts`** additions — `createBoxesBatch` (shared details → N boxes, `unallocated`, logs
`registered` per box, optionally linked to a collection order), `markLabelsPrinted`, `suggestSlotsForBoxes`
(wraps the domain scorer with live store data), `allocateBoxes` (also handles re-allocation — i.e. Move — by
releasing the box's old slot first and logging `moved` instead of `allocated`), `updateBoxDetails` (diffs the
patch against current values, only logs the fields that actually changed, reason required),
`placeBoxHold`/`releaseBoxHold`, `markBoxMissing`. New boxes continue the seed's barcode sequence
(`nextBoxSeq`, same pattern as orders' `nextOrderIdSeq`).

**Endpoints**: `POST /api/boxes/batch`, `POST /api/boxes/mark-label-printed`, `POST /api/boxes/allocate-batch`,
`POST /api/slots/suggest`, `PATCH /api/boxes/:id`, `POST`/`DELETE /api/boxes/:id/hold`,
`POST /api/boxes/:id/missing`.

**Screens**: Register boxes (`/app/boxes/new`) — 3 steps via `?step=`, draft kept in `sessionStorage` so a
refresh mid-wizard doesn't lose it (spec §7). Step 1 details → Step 2 label preview (`BarcodeLabel` using
JsBarcode, "Print all" opens `/print/labels?boxIds=...` — that print route is now real, not a stub) → Step 3
allocate: suggestion cards, or a manual Warehouse→Rack→slot-grid browser (reuses `SlotGrid`); for batches too
big for one slot, clicking a manual slot fills only as many boxes as fit and leaves the rest for the next
slot, and boxes left over at the end stay `unallocated` (spec's explicit allowed outcome). Opening the wizard
from a collection order's "Register new boxes for this order" link locks the client and links the new boxes
back to that order.

Box detail (`src/staff/features/boxes/box-actions.tsx`) now has real **Reprint label**, **Move** (own screen,
reuses the same suggestion+manual-grid pattern, reason required), **Edit details** (reason required, diffs
logged field-by-field), **Place/Release hold** (staff_admin only, per spec), **Mark missing** — all backed by
the store functions above, all producing real audit events.

**Verified in a real browser, single continuous session**: registered 2 boxes with a unique description →
label preview showed both → allocate step showed real suggestions → used one → Finish → searched for the
boxes → opened one → status is genuinely **Stored** with a real warehouse/rack/slot location (not the
placeholder "Not allocated"). Edit details, Place hold (badge shows the reason), and Release hold all
confirmed working on a freshly created box in the same session.

**Note for future verification runs**: each separate `node script.mjs` invocation launches a *fresh* Chromium
profile with empty `localStorage` — state doesn't carry over between separate script runs, only within one
script's single continuous browser session. Don't read this as a bug if a follow-up debug script finds
"no data"; it's isolated by design (same reason Playwright is useful for this — clean slate every run).
