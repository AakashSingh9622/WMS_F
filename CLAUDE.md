@AGENTS.md

# Warehouse Management UI

Staff-facing warehouse app (`/app/*`) + client portal (`/portal/*`) + print documents (`/print/*`), originally
built against a typed mock API (MSW) that could be swapped for the real backend without touching screens — that
swap has now happened for the staff side: Auth, Warehouse/Rack/Slot, Box, Order, and Audit all call the real
backend (`warehouse-management-system-backend`, a sibling project; Express + Prisma on Supabase Postgres) via `next.config.ts` rewrites. Only
per-client detail pages (`/app/clients/[clientId]/*`, a known placeholder) and the client-facing Portal
(`/portal/*`, pending real client login) still run on the MSW mock — see "DocuSoft integration" below for the
staff login/clients side, and the backend repo's `API.md` for the full real API reference. Full requirements
live in `docs/spec.md`; architectural decisions and phase-by-phase status live in `PLAN.md`.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- TanStack Query (server state) — no global store for server data, **except** DocuSoft's own
  folders/clients data (see below), which deliberately uses Redux Toolkit + RTK Query instead
  (`src/store/`) — fetched once per endpoint+args and shared across every consumer automatically,
  which is what was explicitly asked for after noticing per-screen refetches. The Clients screen's last-picked folder/search/page also lives here (`src/store/clientsUiSlice.ts`) so it survives navigating away and back; RTK Query keeps folder/client data for a day (`keepUnusedDataFor`), and login/logout wipe it all. Don't add more
  Redux here for anything else; server state for our own backend/mocks stays on TanStack Query.
- Tailwind v4 + shadcn/ui (`base-nova` style, Radix/base-ui underneath) — components in `src/components/ui`
- react-hook-form + zod for every form; the same zod schemas validate API responses in `src/api/`
- shadcn's `Field`/`FieldGroup`/`FieldLabel`/`FieldError` primitives (not the older `Form`/`FormField`
  wrapper — this shadcn style doesn't ship one) pair directly with react-hook-form's `register`/`errors`
- MSW for the mock API, enabled only when `NEXT_PUBLIC_USE_MOCKS=true` (see `.env.local`)
- Vitest + Testing Library for unit/component tests
- ESLint + Prettier
- TanStack Table **v9** — a major API rewrite from the classic hooks (`useReactTable`, `getCoreRowModel`,
  `ColumnDef`, `VisibilityState`). This version ships that classic shape as a compat layer at the
  `@tanstack/react-table/legacy` subpath (`useLegacyTable`, `LegacyColumnDef`, ...) plus `SortingState`/
  `ColumnVisibilityState` from `@tanstack/table-core`. `src/components/data-table.tsx` imports from `/legacy`
  and re-exports a `ColumnDef` type alias — always get it from there (`import { ColumnDef } from
  "@/components/data-table"`), never from `@tanstack/react-table` directly.
- shadcn's Button/DropdownMenuTrigger/SidebarMenuButton are Base UI components using a `render` prop for
  polymorphism, not Radix's `asChild` (`render={<Link href="..." />}`, content stays as the component's own
  children — not on the render element). `nativeButton` on `Button` describes what `Button`'s *own* `render`
  target is — set `nativeButton={false}` only when `Button` itself has `render={<Link .../>}` (its output
  isn't a `<button>`). Leave it unset (true) on a plain `<Button>` used as *someone else's* render target
  (`<DialogTrigger render={<Button />}>`, `<DropdownMenuTrigger render={<Button />}>`) — that Button still
  renders a real `<button>`, so `nativeButton={false}` there is backwards and triggers the same warning in
  the opposite direction.

## Routing (adapted from Vite/React Router to Next.js App Router)

The original spec was written for `createBrowserRouter`. Since `/app`, `/portal`, `/print`, `/login` are
already distinct URL prefixes, they're plain folders under `src/app/` — no route groups needed. Key
translations, forced by Next 16 rather than chosen:

- `middleware.ts` → **`src/proxy.ts`** (renamed in Next 16; same behavior). Coarse guard only: redirects
  unauthenticated/wrong-side traffic. Fine-grained role checks (e.g. staff_admin-only settings pages) happen
  per-route via `requireRole()` in `src/auth/session.ts`, which redirects to the literal `/app/403`... see
  below — to `/403`.
- `/403` and 404 are literal routes (`src/app/403/page.tsx`, `src/app/not-found.tsx`), not Next's experimental
  `forbidden()`/`global-not-found` conventions — kept literal to match the spec's explicit route list.
- Box detail (`/app/boxes/:boxId`) and client detail (`/app/clients/:clientId`) tabs are ordinary nested
  routes: a `layout.tsx` renders the header + `TabNav`, with `page.tsx`/`history/page.tsx`/etc. beneath it.
- No `useMatches()` equivalent exists in the App Router — breadcrumbs are derived from the pathname via
  `useBreadcrumbs()` (`src/hooks/useBreadcrumbs.ts`) against a static label map in `src/domain/navigation.ts`.
- Route-level code splitting is automatic per route segment — no manual `lazy()`/`dynamic()` needed for that.
- The spec's `src/app/router.tsx`/`providers.tsx`/guards can't live in `src/app/` (Next reserves that folder
  for routing). Cross-cutting bootstrap code lives in **`src/core/`** instead.

## Auth (staff side is real now, client/portal side is still mock)

Session token: the real backend issues a **signed JWT** (HS256, `SESSION_JWT_SECRET`; backend
`src/auth/sessionToken.js`). `src/auth/session-shared.ts` only reads its payload for the route guard — the backend
verifies the signature on every API call. The MSW mock still issues plain base64url JSON claims, which `decodeSession`
also accepts. The **client-facing portal is a separate static project** (`docusoft-web-portal-USA/wareHouse`, HTML +
jQuery) that talks to the backend's `/api/portal` with its own token — see the backend's `API.md`. Originally issued by the MSW mock; **staff login (`admin@...`/`operator@...` roles) now goes
to the real backend** (`warehouse-management-system-backend`, a sibling project) via `next.config.ts` rewrites
on `/api/auth/*` — see "DocuSoft integration" below. Client/portal login is still MSW-mocked (on hold). Either
way, the token SHAPE is identical, which is why `src/proxy.ts` and `useAuth.tsx` never needed to change.
Login (`src/app/login/page.tsx`) writes the token to a plain cookie client-side after `/api/auth/login`
returns it, so `src/proxy.ts` (server) can read it. Client components read the session via `useAuth()`
(`src/auth/useAuth.tsx`), which calls `GET /api/auth/me` through TanStack Query — it does not read the cookie
directly.

The session-claims cookie is readable only via `document.cookie` inside MSW handlers, never
`request.headers.get("cookie")` — browsers treat `Cookie` as a forbidden header and never expose it to a
Service Worker's intercepted `Request`, even though msw/browser's handler resolvers do run in the page's main
thread (so `document`/`localStorage` are fine to use there). This limitation is MSW-specific and does NOT
apply to the real backend (a normal Express server reading `req.headers.cookie` has no such restriction), nor
to `src/proxy.ts` — it's real server-side Next.js middleware reading `NextRequest.cookies`.

## DocuSoft integration

Staff login credentials are verified against DocuSoft's real `.asmx` API (`Json_GetAgreementList`), handled
entirely by the backend (see that repo's README) — `POST /api/auth/login` returns `{ user, token, agrno }`.
Everything else DocuSoft-related (`Json_GetFolders`, `Json_GetAllClientList`, `Json_GetClientsByFolder`) is
called **directly from this frontend, in the browser** — never through our backend — because the user wants
to keep adding more DocuSoft API calls here without touching the backend each time, and because clients/
folders must never be persisted into our own database (they live only in DocuSoft). Reference implementation
for the exact request/response shape of every DocuSoft call: `C:\Aakash Singh\projects\docusoftpractice` (a
plain-JS project already calling these same endpoints from a browser) — read it before adding a new DocuSoft
call rather than guessing field names; DocuSoft's own field casing is inconsistent across endpoints (e.g.
`ClientID` from `Json_GetClientsByFolder` vs `ClientId` from `Json_GetAllClientList` — both verified, not typos).

`useAuth.tsx`'s login mutation stashes `{agrno, Email, password}` (password base64-encoded, same form
DocuSoft expects) into `localStorage` right after a successful staff login (`src/store/docusoftCreds.ts`) —
this is the only place a password is ever stored, and it's cleared on logout. `src/store/docusoftApi.ts`'s
RTK Query `baseQuery` reads these on every DocuSoft call. This is a deliberate, known trade-off (same one
`docusoftpractice` itself makes): base64 is encoding, not encryption, so this is effectively the plaintext
password sitting in `localStorage`. Acceptable for an internal/demo tool today; flagged here for whoever
revisits it later.

## API paths: everything mock/real lives under `/api/*`

`src/api/client.ts` prefixes every request with `/api` (`apiClient.get("/boxes")` → `GET /api/boxes`), and
every MSW handler is registered at the matching `/api/...` path. This is load-bearing, not a style choice:
MSW's Service Worker intercepts full page navigations too, not just `fetch()`/XHR calls. A mock route
registered at a bare path that happens to match a real page route (e.g. the portal API's `/portal/orders`
colliding with the page at `src/app/portal/orders/page.tsx`) hijacks the browser's navigation to that page and
serves the raw JSON instead of the HTML — this actually happened during Phase 3 and was fixed by moving every
mock endpoint under `/api/`. New API modules/handlers must follow the same convention. `src/auth/useAuth.tsx`
and the login/forgot-password pages call `fetch("/api/auth/...")` directly (not through `apiClient`) for the
same reason.

## Storage capacity is in centimetres (not box units)

Each rack cell (row × column) IS one storage location (slot) — no sub-slots. When adding a rack the user gives
the length of ONE cell in cm or feet; the backend converts feet → whole cm and stores it (`Rack.cellLengthCm`,
`Slot.capacity` = that length, `Slot.used` = cm of boxes inside). A box takes `BOX_LENGTH_CM` of a cell
(standard 40 cm, large 80 cm — `src/domain/dimensions.ts`, mirrored in the backend's `src/utils/dimensions.js`;
change both together). `src/domain/slotSuggestion.ts` + the MSW location mocks still use the old unit model but
are dead code now that Warehouse/Rack/Slot go to the real backend.

## Screen layout & lists (fixed-height shell, paginated tables)

The staff shell is exactly one screen tall (`h-svh`): the top bar never scrolls away and only the content area scrolls.
A page that is mostly a table makes its root `flex h-full min-h-0 flex-col` and gives the table `flex-1` — then
`DataTable` (`src/components/data-table.tsx`) scrolls only its own body (sticky header) and keeps the toolbar and the
pagination footer in view. Tables and long lists are **server-paginated** (`pagination` prop / `PaginationFooter`; the
API caps `pageSize` at 100 and returns `{ items, total }`) — never fetch a whole list. Column sorting is off on
paginated tables (it would only sort the visible page).

## Orders are tied to a client contact

An order is saved with the client id AND the email of the client contact it is for (`Order.contactEmail`; required
when creating). The create-order form picks that contact from the client's DocuSoft contacts — the `Table6` of the
client card already cached in Redux (`useClientContacts`, only for the client opened from the Clients list; otherwise
the email is typed). Future client-side/portal login = client id + contact email: a contact sees only its own orders,
a main contact sees all of the client's (`visibleToContactWhere` in the backend).

## Folder conventions (spec §10)

```
src/app/        Next.js routes only (thin — delegate to feature folders below)
src/core/       providers.tsx, mock-gate.tsx (cross-cutting bootstrap; NOT src/app/, that's Next's routing folder)
src/api/        client.ts, types.ts + zod schemas, one file per resource, query-key factories
src/store/      Redux store — ONLY RTK Query for DocuSoft folders/clients (docusoftApi.ts), nothing else
src/mocks/      MSW handlers, seed data, orderMachine.ts (added in the Orders phase), persistence
src/auth/       session.ts (server), useAuth.tsx (client)
src/domain/     describeAuditEvent, order rules, status metadata, navigation.ts
src/staff/      staff-only feature code (StaffShell, settings nav, features/*)
src/portal/     portal-only feature code
src/print/      print-only feature code (documents/*)
src/components/ shared UI — shadcn primitives in components/ui, plus cross-side shared components
src/hooks/      useBarcodeScanner, useBreadcrumbs, useUrlFilters, useDebounce
src/lib/        formatting, capacity math, print helpers, cn()
```

`src/staff/`, `src/portal/`, `src/print/` (and their route folders `src/app/app/`, `src/app/portal/`,
`src/app/print/`) must not import from each other — enforced by `no-restricted-imports` overrides in
`eslint.config.mjs`. Shared code goes in `components/`, `domain/`, `hooks/`, `lib/`, or `api/`.

## Commands

- `npm run dev` — start the dev server (mocks on by default via `.env.local`)
- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` — run after every phase
- `npx shadcn@latest add <component>` — add a shadcn/ui component

## Demo accounts (mock mode)

`admin@demo.test` (staff_admin), `operator@demo.test` (staff_operator), `client@demo.test` (client_admin, scoped
to seeded client `client-1` / Acme Legal Partners), `viewer@demo.test` (client_user, scoped to `client-2` /
Globex Insurance) — password `demo1234` for all. Shown on the login page only when mocks are on.

## Seed data

`src/mocks/seed/index.ts` orchestrates one shared `mulberry32` PRNG across `locations.ts` (warehouses/racks/
slots — capacity only, `used` starts at 0), `clients.ts` (25 clients with grouped attributes), `boxes.ts`
(~1,200 boxes; placing `stored` ones into real slots is what actually sets `Slot.used`, not `locations.ts`),
`orders.ts` (~90 orders across all 3 types, mutates a subset of boxes to `reserved` with `openOrder` set, and
returns a `historicalOrderByBoxId` map so `audit.ts` can build a correct history chain for `out`/`destroyed`
boxes), and `audit.ts` (per-box event chain, `visibleToClient` set per event type per spec §5). `src/mocks/
store.ts` holds the generated state (versioned + persisted to `localStorage`; bump `SEED_VERSION` on any seed
shape change) and exposes the search/filter functions the MSW handlers call.

**Deliberately not seeded yet**: box status `picked`/`pending_destruction` (both are mid-order-workflow states
that need the real Pick screen / order state machine from spec §11 phase 5 to generate correctly — seeding
them statically would be guesswork). `describeAuditEvent` (spec §5) lives in `src/domain/audit.ts` with a unit
test per event type in `audit.test.ts`.
