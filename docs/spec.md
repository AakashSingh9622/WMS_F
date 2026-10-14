# Build prompt: Warehouse Management UI (Vite + React)

> This is the original build spec as given, kept verbatim for reference. It was written against Vite + React
> Router; the actual project is Next.js 16 (App Router). See `CLAUDE.md` for exactly what was translated and
> why, and `PLAN.md` for phase-by-phase status.

---

You are building the frontend for a warehouse records-storage system. A warehouse team registers physical archive boxes for clients, prints barcode labels, and stores each box in a slot. Boxes then move through **orders**: collected from clients, dispatched back to them, or destroyed. Every action on a box is recorded in its **audit history**. Clients log in to a separate portal to see their own inventory, track orders, and request new ones. The database already exists; the backend API may not be finished, so you will build against a typed API layer backed by mock handlers that can be swapped for the real API without touching screens.

Work in the phases at the end of this prompt. Before writing code, read the whole prompt, then write a short plan in `PLAN.md` and a `CLAUDE.md` that records the stack, folder conventions, and commands. Do not block on open questions — the assumptions section tells you what to do.

## 1. Stack

Use current stable versions of:

- Vite + React + TypeScript (strict mode)
- React Router, using the data router (`createBrowserRouter`) with nested routes, route-level `lazy()` loading, and an `errorElement` on each branch
- TanStack Query for server state; no global store for server data
- Tailwind CSS + shadcn/ui components (Radix primitives underneath)
- react-hook-form + zod for every form; zod schemas also validate API responses in the API layer
- TanStack Table for data grids (sorting, pagination, column visibility)
- JsBarcode for generating Code 128 barcodes as SVG
- MSW (Mock Service Worker) for the mock API, enabled only when `VITE_USE_MOCKS=true`
- Vitest + Testing Library for unit/component tests, Playwright for a small set of end-to-end flows
- ESLint + Prettier

Do not add other state or UI libraries without a clear reason written in `PLAN.md`.

## 2. The two sides and the router (most important section)

The app has two audiences that must stay strictly separated:

- **Warehouse staff** (`/app/*`) manage warehouses, racks, slots, boxes, orders, and clients.
- **Clients** (`/portal/*`) see only their own boxes and orders, and can request new orders.

Both share one codebase, one login, and one design system, but each side has its own layout, navigation, and route tree. Build the router so this separation is structural, not scattered `if` checks:

```
/login                         public
/forgot-password               public (UI only; posts to API)
/                              redirect by role: staff → /app, client → /portal, none → /login
/403                           forbidden
*                              404

/app                           <RequireAuth><RequireRole side="staff"><StaffLayout/>
  index                        Dashboard
  boxes                        Find a box (search)
  boxes/new                    Register boxes (wizard)
  boxes/:boxId                 Box detail layout with nested tabs:
    index                      Overview (details, location, open orders)
    history                    Audit history (full timeline)
    orders                     Orders this box has been on
  boxes/:boxId/move            Move / re-allocate box
  orders                       Orders list (tabs by status, filters)
  orders/new                   Create order (?type=collection|dispatch|destruction&clientId=&boxIds=)
  orders/:orderId              Order detail (status, lines, actions, documents)
  orders/:orderId/pick         Pick / scan screen (dispatch + destruction)
  orders/:orderId/receive      Receive screen (collection)
  warehouses                   Warehouse list
  warehouses/:warehouseId      Warehouse overview (racks + occupancy)
  warehouses/:warehouseId/racks/:rackId   Rack detail (slot grid)
  clients                      Client management (search)
  clients/:clientId            Client detail layout with nested tabs:
    index                      Overview (upstream attributes)
    boxes                      Client's boxes
    orders                     Client's orders
    activity                   Client's audit activity
    users                      Client's portal users
  audit                        Global audit log (staff_admin only)
  settings                     Settings layout with nested sections:
    index → profile            My profile
    warehouse-layout           Warehouses, racks, slots, capacities   (staff_admin only)
    labels                     Label size / printer settings
    orders                     Order types, destruction methods, SLA defaults (staff_admin only)
    users                      Staff users and roles                  (staff_admin only)

/print                         <RequireAuth> bare layout, no chrome — print-only documents
  labels?boxIds=               Box labels
  pick-list/:orderId           Pick list
  delivery-note/:orderId       Dispatch delivery note
  destruction-certificate/:orderId   Certificate of destruction

/portal                        <RequireAuth><RequireRole side="client"><PortalLayout/>
  index                        Portal dashboard
  inventory                    My boxes (search)
  inventory/:boxId             Box detail + client-facing history
  orders                       My orders
  orders/new                   Request an order (?type=&boxIds=)
  orders/:orderId              Order detail + status tracking
  settings                     Profile, password
```

Router requirements:

- Define routes in `src/app/router.tsx`. Each side's routes live in their own module (`src/staff/routes.tsx`, `src/portal/routes.tsx`, `src/print/routes.tsx`) and are lazy-loaded, so a client's browser never downloads staff screens.
- `RequireAuth` redirects to `/login?redirectTo=<path>` and returns the user there after login.
- `RequireRole` takes a side (`staff` | `client`) and optionally specific roles (e.g. `staff_admin`). Wrong side → redirect to that user's own home. Right side, missing role → `/403`.
- Print routes are accessible to both sides, but the API decides what each user may print (a client may print their own destruction certificate, not a pick list).
- Hide navigation items the user's role cannot open, but always enforce access in the route guard too.
- Each route exports a `handle` with a breadcrumb label; the layouts render breadcrumbs from `useMatches()`.
- Search, filter, sort, and pagination state lives in URL search params, so searches survive refresh, the back button works, and staff can share a link to a result set.
- Each side has its own `errorElement` that renders inside that side's layout.
- Portal requests never pass a client ID from the UI. The API scopes portal data to the logged-in user's client server-side; the mock handlers must do the same, so the frontend never relies on hiding data it has already received.

## 3. Domain model (UI types)

The storage hierarchy is fixed at three levels: **Warehouse → Rack → Slot**. Boxes are stored in slots. Put these types in `src/api/types.ts` with matching zod schemas:

```ts
Warehouse   { id, code, name, address?, rackCount, slotCount, usedCapacity, totalCapacity }
Rack        { id, warehouseId, code, label, rows, columns, usedCapacity, totalCapacity }
Slot        { id, rackId, warehouseId, code, barcode, row, column, capacity, used, status: 'available'|'full'|'blocked' }

Box         { id, boxNumber, barcode, clientId, clientName, description, department?, reference?,
              filingDateFrom, filingDateTo?, destroyAfter?, size: 'standard'|'large',
              status: BoxStatus, onHold: boolean, holdReason?,
              slotId?, locationPath?: { warehouse, rack, slot },
              openOrder?: { id, orderNumber, type, status },
              createdAt, createdBy }
BoxStatus   'unallocated'        // registered or received, not yet in a slot
          | 'stored'             // in a slot
          | 'reserved'           // stored, but on an open order
          | 'picked'             // taken out of the slot for an order
          | 'out'                // dispatched to the client
          | 'pending_destruction'// picked for destruction, not yet destroyed
          | 'destroyed'          // terminal

Order       { id, orderNumber, type: OrderType, status: OrderStatus, clientId, clientName,
              requestedBy: Actor, requestedVia: 'staff'|'portal', createdAt,
              scheduledFor?, completedAt?, address?, contactName?, contactPhone?, notes?,
              boxCount, lineSummary: Record<OrderLineStatus, number>,
              destruction?: { method: 'shred'|'pulp'|'incinerate', authorisedBy, authorisedAt, witness? },
              collection?: { expectedNewBoxes: number } }
OrderType   'collection' | 'dispatch' | 'destruction'
OrderStatus 'requested' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rejected'
OrderLine   { id, orderId, boxId?, boxNumber?, status: OrderLineStatus, fromLocation?, scannedAt?, scannedBy? }
OrderLineStatus 'pending' | 'picked' | 'dispatched' | 'received' | 'destroyed' | 'missing' | 'removed'

AuditEvent  { id, boxId, boxNumber, clientId, type: AuditEventType, at, actor: Actor,
              orderId?, orderNumber?, fromLocation?, toLocation?,
              changes?: { field, from, to }[], note?, visibleToClient: boolean }
AuditEventType 'registered' | 'label_printed' | 'allocated' | 'moved' | 'details_edited'
             | 'added_to_order' | 'removed_from_order' | 'picked' | 'dispatched' | 'collected'
             | 'received' | 'refiled' | 'marked_missing' | 'destruction_authorised' | 'destroyed'
             | 'hold_placed' | 'hold_released' | 'status_changed'
Actor       { id, name, side: 'staff'|'client'|'system' }

Client      { id, code, name, status, boxCount, openOrderCount, attributes: ClientAttribute[] }
ClientAttribute { key, label, value, type: 'text'|'date'|'email'|'phone'|'url'|'number', group? }
SlotSuggestion  { slotId, locationPath, freeCapacity, score, reasons: string[] }
User        { id, name, email, side: 'staff'|'client', roles: Role[], clientId? }
Role        'staff_admin' | 'staff_operator' | 'client_admin' | 'client_user'
```

Capacity is measured in **box units**: a standard box uses 1 unit, a large box uses 2. Slot capacity is a number of units, configured per slot (defaulting from the rack). A slot's used capacity counts boxes whose status is `stored` or `reserved`. Picking a box frees its space only when the order line is completed, so space isn't double-booked while a box is on a trolley.

Client properties come from an upstream system and will change. Never hard-code client fields beyond `id`, `code`, `name`, `status`. Render everything else from `attributes`, grouped by `group`, formatted by `type`. A new upstream field must appear on the client detail page with no frontend change.

## 4. Orders: lifecycle and rules

Orders are how boxes move in and out. There are three types, each with the same status flow but different line steps:

```
requested → approved → scheduled → in_progress → completed
     ↘ rejected          ↘ cancelled (any point before completed)
```

Staff-created orders start at `approved`. Portal-requested orders start at `requested` and need a staff member to approve or reject them (with a reason).

**Collection** (bring boxes into the warehouse)
- Has an address, a contact, a scheduled date, and one of: a count of expected new boxes, a list of existing boxes being returned (status `out`), or both.
- The receive screen (`/app/orders/:orderId/receive`):
  - Returning boxes: scan each one. It becomes `received`/`unallocated`. Then refile it, and suggest its previous slot first if it has room.
  - New boxes: open the register wizard pre-filled with the client and the order, so they're linked to the order.
- Complete once every line is received or marked missing.

**Dispatch** (send boxes out to the client)
- Lines are existing `stored` boxes. Adding a box sets it to `reserved`. A box can only be on one open order at a time.
- The pick screen generates a **pick list sorted in walking order** (warehouse → rack → row → column). Staff scan each box. Scanning a box that isn't on the order shows a clear error; scanning one already picked is a no-op with a warning.
- Mark dispatched: record recipient name, and optionally a driver and vehicle. Lines become `dispatched` and boxes become `out`, freeing their slot capacity. Print a delivery note.

**Destruction** (shred or otherwise destroy boxes)
- Lines are existing boxes. Validation rejects boxes that are `onHold` or already on an open order, and shows why per box.
- Needs **client authorisation** before it can be scheduled: the authoriser's name and time, captured either in the portal (the client ticks "I authorise the destruction of these N boxes" and types their name) or by staff recording offline authorisation with a reference. Store it on the order and log `destruction_authorised` on every box.
- If a box's `destroyAfter` date is in the future, show a warning that staff_admin must override.
- Pick flow as for dispatch → `pending_destruction`. Then mark destroyed with method, date, and an optional witness → `destroyed`, freeing capacity. Destroyed boxes stay searchable forever, never deleted.
- Generate a **certificate of destruction**: order number, client, method, date, authoriser, witness, and the full list of box numbers and descriptions. The client can download it from the portal.

**Rules across all types**
- Every line state change writes an `AuditEvent` on that box, including the order ID and number.
- Lines can be marked `missing` with a note (a box that should be in its slot but isn't). That logs `marked_missing` and flags the box on the dashboard.
- Cancelling an order releases `reserved` boxes back to `stored` and logs `removed_from_order`.
- Order numbers are human-friendly and sequential per type: `COL-000123`, `DSP-000123`, `DST-000123`.

## 5. Audit history

This is the system's record of truth, and it answers "what happened to this box?". It is append-only: the UI has no edit or delete for events.

- Render each event as a plain sentence built from its data, with the actor, a relative time (the exact timestamp on hover), and links:
  - "**Registered** by Ahmed Khan — collected on order COL-000118"
  - "**Filed** in WH1 › Rack B-04 › Slot 3-2 by Ahmed Khan"
  - "**Moved** from WH1 › B-04 › 3-2 to WH1 › C-01 › 1-4 by Sara Ali — note: rack B-04 maintenance"
  - "**Details edited** by Sara Ali — description: 'Invoices 2019' → 'Invoices 2019 Q1–Q2'"
  - "**Added to order** DSP-000207 (dispatch) by client user John Smith via portal"
  - "**Dispatched** on order DSP-000207 — received by M. Jones"
  - "**Destroyed** (shred) as per order DST-000123 — witnessed by R. Patel"
- Put the sentence builder in one function (`describeAuditEvent`) with unit tests for every event type. Screens must never hand-format events.
- **Box detail › History tab:** full timeline, newest first. Filter by event type, filter by order, and export the box's history as CSV.
- **Client detail › Activity tab:** events across all of that client's boxes, with the same filters plus a date range.
- **Global audit log** (`/app/audit`, staff_admin): every event, filtered by actor, type, client, order, and date range. Server-paginated, exportable.
- **Portal:** clients see only events with `visibleToClient: true`, worded for them ("Received at our warehouse", "Dispatched to you on order DSP-000207", "Destroyed as per your order DST-000123"). They never see staff names, rack or slot codes, or internal notes. The backend decides visibility; the mock sets it per event type.
- Any edit to box details goes through a form that requires a reason for the change on staff_admin-only fields, and produces a `details_edited` event with field-level `changes`.

## 6. API layer

- `src/api/client.ts`: a small fetch wrapper (base URL from `VITE_API_URL`, auth header, JSON, typed errors, 401 → clear session and redirect to login).
- One module per resource (`boxes.ts`, `slots.ts`, `warehouses.ts`, `orders.ts`, `audit.ts`, `clients.ts`, `auth.ts`, `users.ts`) exporting typed functions and TanStack Query hooks with a consistent query-key factory. Mutations invalidate every affected query. For example, completing a dispatch invalidates the order, its boxes, their audit, slot capacity, and dashboard counts.
- Parse every response with its zod schema. A schema mismatch should throw a visible, descriptive error in development.
- Write the endpoint list to `docs/api-contract.md` (method, path, query params, request/response shapes, and which status transitions each order endpoint allows) so the backend team can implement against it. Include at least:
  - `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
  - `GET /boxes` (search: `q`, `barcode`, `clientId`, `filingFrom`, `filingTo`, `status`, `onHold`, `warehouseId`, `rackId`, `orderId`, `page`, `pageSize`, `sort`)
  - `POST /boxes/batch` (register N boxes with shared details, optional `orderId`; returns created boxes with barcodes)
  - `GET /boxes/:id`, `PATCH /boxes/:id` (with `reason`), `POST /boxes/:id/hold`, `DELETE /boxes/:id/hold`
  - `POST /boxes/:id/allocate` `{ slotId }`, `POST /boxes/allocate-batch` `{ allocations: [{ boxId, slotId }] }`
  - `GET /boxes/by-barcode/:barcode`
  - `GET /audit` (filters: `boxId`, `clientId`, `orderId`, `actorId`, `type`, `from`, `to`, pagination), `GET /audit/export` (CSV)
  - `GET /orders` (filters: `type`, `status`, `clientId`, `scheduledFrom`, `scheduledTo`, `q`), `POST /orders`, `GET /orders/:id`, `GET /orders/:id/lines`
  - `POST /orders/:id/lines` `{ boxIds }`, `DELETE /orders/:id/lines/:lineId`
  - `POST /orders/:id/approve`, `/reject` `{ reason }`, `/schedule` `{ scheduledFor }`, `/start`, `/cancel` `{ reason }`, `/complete`
  - `POST /orders/:id/authorise-destruction` `{ name, reference? }`
  - `POST /orders/:id/scan` `{ barcode }` → the updated line or a typed error (`not_on_order`, `already_scanned`, `on_hold`)
  - `POST /orders/:id/lines/:lineId/missing` `{ note }`
  - `POST /orders/:id/dispatch` `{ recipientName, driver?, vehicle? }`, `POST /orders/:id/destroy` `{ method, destroyedAt, witness? }`
  - `POST /slots/suggest` `{ clientId, boxes: [{ size }], warehouseId?, preferSlotIds? }` → `SlotSuggestion[]`
  - `GET /slots/by-barcode/:barcode`
  - `GET /warehouses`, `GET /warehouses/:id/racks`, `GET /racks/:id/slots`, plus CRUD for warehouse-layout settings
  - `GET /clients` (search), `GET /clients/:id`, `GET /clients/:id/boxes`, `GET /clients/:id/users`
  - `GET /portal/summary`, `GET /portal/boxes`, `GET /portal/boxes/:id`, `GET /portal/boxes/:id/history`, `GET /portal/orders`, `POST /portal/orders`, `GET /portal/orders/:id`, `POST /portal/orders/:id/cancel` (only while `requested`), `POST /portal/orders/:id/authorise-destruction` (all scoped to the session's client)

### Mock backend (MSW)

- Implement order state transitions as a single state machine module (`src/mocks/orderMachine.ts`) that rejects illegal transitions with a typed error. The real backend should mirror it, so reference it in the API contract.
- Seed deterministic data with a fixed random seed: 2 warehouses, 6–10 racks each, 4×6 slots per rack, 25 clients, and around 1,200 boxes spread unevenly (a few big clients, many small ones). Include some full, empty, and blocked slots, and some unallocated boxes waiting to be put away.
- Seed about 60 orders across all types and statuses. Include a portal-requested destruction waiting for approval, an in-progress dispatch half picked, a completed destruction with a certificate, and a collection with returning boxes. Include boxes that are `out`, `destroyed`, and `onHold`.
- Generate a realistic audit history for every seeded box that matches its current state (a destroyed box has registered → filed → … → added to order → picked → destroyed).
- Seed users: `admin@demo.test` (staff_admin), `operator@demo.test` (staff_operator), `client@demo.test` (client_admin for one client), and `viewer@demo.test` (client_user for another client). The password for all is `demo1234`. Show these on the login page only when mocks are on.
- Persist mock state to `localStorage` so changes survive a refresh, with a "Reset demo data" button in settings (mock mode only).
- Add 150–400 ms simulated latency and an optional `?mockError=1` flag to test error states.

### Slot suggestion logic (mock implementation; the real one belongs on the backend)

Given a client and a list of boxes to store, return the top 5 slots or slot groups with a score and plain-language reasons:

1. If `preferSlotIds` is given (a returning box's previous slot) and it has room, rank it first.
2. Prefer slots in racks where this client already has boxes, to keep a client's archive together.
3. Prefer partially filled slots the batch fits into exactly or nearly, to reduce fragmentation.
4. For batches that don't fit one slot, prefer adjacent slots in the same rack (same row, consecutive columns).
5. Never suggest `blocked` or `full` slots, or slots without enough free capacity.
6. Reasons read like "Previous slot for this box", "Same rack as 34 other ACME boxes", "Fills slot to 100%", "3 adjacent slots in Rack B-04".

## 7. Screens

For every screen, build loading (skeletons, not spinners), empty, and error states. Every list is paginated server-side.

### Login
Email and password, show/hide password, inline validation, a "Forgot password" link, a clear error for wrong credentials, and a disabled state while submitting. After login, go to `redirectTo` if it belongs to the user's side, otherwise to their home. The same login serves staff and clients, so use neutral branding.

### Staff: Dashboard
- Capacity per warehouse (used vs total units, percent), and racks over 90% full.
- **Needs attention:** portal orders awaiting approval, orders scheduled today, overdue orders, unallocated boxes, and boxes marked missing. Each is a count linking to the filtered list.
- Orders by status for the next 7 days.
- Recent activity: the last 20 audit events, rendered with `describeAuditEvent`.
- Quick actions: Register boxes, New order (split button by type), Find a box, and a scan field.

### Staff: Register boxes
A three-step wizard at `/app/boxes/new`. Step state lives in the URL (`?step=`), and the draft is kept in session storage so a refresh doesn't lose work. If opened from a collection order (`?orderId=`), the client and order are locked, and the header says "Receiving new boxes for COL-000123".

1. **Details.** Pick a client (async searchable combobox), set quantity (1–200), and fill in the shared details for the batch: description, department, reference, filing date from/to, destroy-after date (optional), and size. For quantity above 1, an optional table lets staff override description or reference per box. Submitting calls `POST /boxes/batch`.
2. **Print labels.** Show a preview of every label: a Code 128 barcode, the box number in large type, the client code and name, the filing date range, and a logo placeholder. Offer "Print all" and per-label print, both via `/print/labels`. Printing uses `@page` CSS sized from label settings (default 100 × 50 mm, one label per page for thermal printers), with an optional A4 sheet layout. Log `label_printed`. Staff can move on without printing, but the box stays flagged as "label not printed".
3. **Allocate.** Call `POST /slots/suggest` and show the suggestions as cards with the location path, free capacity after placement, and the reasons. Selecting one highlights the slots on a mini rack grid. Staff can also browse and pick any slot manually (Warehouse → Rack → slot grid). For batches, show which box goes to which slot and allow reassigning. Optional **scan to confirm**: scanning the slot's barcode marks that placement verified. Confirm calls the allocate endpoint, then shows a success screen with links to "Register more", "View boxes", and "Back to order" when relevant.

Boxes left unallocated at the end stay `unallocated` and appear on the dashboard.

### Staff: Find a box
This is the "I only remember part of it" search, so it should be fast and forgiving:

- One prominent search input that matches box number, barcode, description, reference, department, and client name (debounced).
- Filters: client, filing date range, status (multi-select; excludes `destroyed` by default, with an "Include destroyed" toggle), on hold, warehouse, rack, size, and order.
- **Scanner support:** an input value that exactly matches a barcode goes straight to that box's detail page.
- Results table: box number, client, description, filing dates, status badge, open order chip (if any), and the **location path shown prominently** (e.g. `WH1 › Rack B-04 › Slot 3-2`) with a "Show on rack" link. Column visibility and page size are remembered per user.
- **Bulk actions** on selected rows: "Add to new dispatch order", "Add to new destruction order", "Reprint labels". The bulk order actions only allow boxes from one client and open `/app/orders/new` pre-filled.
- All filters live in the URL, with a "Clear filters" action. When there are no results, suggest loosening the filters.

### Staff: Box detail
A layout with a persistent header and tabs as nested routes.

- **Header:** box number (large), barcode (rendered small with copy), status badge, on-hold badge with its reason, client link, and the location path. If the box is on an open order, show a banner: "On dispatch order DSP-000207 — scheduled 2 Oct", linking to the order.
- **Actions** (shown or disabled by status and role, with a tooltip explaining why when disabled): Reprint label; Move (`/move`, reusing the allocate step with suggestions and a required reason); Add to order (dispatch or destruction); Edit details; Place/release hold (staff_admin, with a required reason); Mark missing.
- **Overview tab:** all fields in labelled groups (identity, contents, dates, location), a mini rack grid highlighting the slot, and the last 5 audit events with a link to the full history.
- **History tab:** the full audit timeline (section 5).
- **Orders tab:** every order the box has been on, with type, number, status, dates, and the line's outcome.

A destroyed box's detail page is read-only, with a clear "Destroyed on 14 Mar 2026 per DST-000123" banner and a link to the certificate.

### Staff: Orders
- **List:** tabs for Needs approval, Scheduled, In progress, Completed, and All. Filters for type, client, scheduled date range, and requested via. The table shows order number, type icon + label, client, box count, line progress (e.g. "18/24 picked" as a mini bar), scheduled date (red if overdue), status, and requested by. Filters live in the URL.
- **Create:** choose the type first (three large options with a one-line description of each), then the client, then:
  - Collection: address/contact (pre-filled from client attributes where they exist), expected new boxes, and returning boxes (searches only that client's `out` boxes).
  - Dispatch: add boxes by search, scan, or pasting a list of box numbers. Each added box is validated live, and ineligible ones are shown with the reason.
  - Destruction: the same box picker, plus the authorisation section (record offline authorisation now, or leave it for the client to authorise in the portal) and destroy-after warnings.
  - All types: scheduled date, notes, and a review step before submitting.
- **Detail:** a header with the order number, type, status, and client, and a horizontal status stepper showing where the order is. The actions available depend on status and role: approve/reject, schedule, start picking, receive, dispatch, destroy, complete, cancel. The main panel lists lines with each box's number, description, location at time of order, line status, and scanned by/at. The side panel shows details, authorisation, and documents (pick list, delivery note, certificate — each opens its `/print` route). At the bottom is an order-level activity feed of the audit events for this order.
- **Pick screen** (`/pick`): built for a tablet on the warehouse floor. Large type, the pick list grouped by rack in walking order, and a big "next box" card with its location. It is scanner-first: every scan gives instant feedback (green flash + sound for OK, red + reason for errors). Progress bar, "Mark missing" per line, and "Finish picking" when every line is picked or missing.
- **Receive screen** (`/receive`): scan returning boxes, see expected vs received, "Register new boxes" (opens the wizard linked to the order), then refile using slot suggestions.

### Staff: Warehouses and racks
- Warehouse list with capacity bars.
- Warehouse overview: a grid of rack cards, each with an occupancy percentage and a colored bar (good / warning / critical thresholds from settings).
- Rack detail: a rows × columns slot grid. Each cell shows its slot code, used/capacity, and a fill color; blocked slots are hatched. Boxes that are reserved for an order get a small marker. Clicking a cell opens a side panel listing its boxes, each linked. Include a legend. Cells work with the keyboard (arrow keys, Enter).

### Staff: Client management
- Search by name, code, or attribute text; filter by status; sort by name, box count, open orders, or recently active. The table shows code, name, status, box count, open orders, and last activity.
- Client detail: a header (name, code, status, box count, capacity used, open orders), with quick actions "New order for this client" and "Register boxes for this client". Tabs as nested routes:
  - Overview: upstream attributes rendered dynamically by group (see section 3).
  - Boxes: the Find-a-box table pre-filtered to this client.
  - Orders: the orders table pre-filtered to this client.
  - Activity: audit events for this client (section 5).
  - Users: portal users linked to this client (list only for now).

### Staff: Global audit log
`/app/audit` (staff_admin only): the section 5 view across everything, filtered by actor, type, client, order, and date range, with CSV export.

### Staff: Settings
A settings layout with left navigation.
- Profile: name, email, password change.
- Warehouse layout (staff_admin): CRUD for warehouses and racks (code, label, rows, columns, default slot capacity), editing individual slot capacity, and blocking/unblocking slots. Guard against reducing capacity below current usage.
- Labels: label size, layout (thermal vs A4 sheet), which fields to include, and a live preview.
- Orders (staff_admin): destruction methods, default dispatch/collection lead time, whether portal orders need approval (default: yes), and the overdue threshold.
- Users (staff_admin): staff list, invite, role assignment, deactivate.
- Mock mode only: "Reset demo data".

### Portal: Dashboard
Total boxes, boxes by status (in storage, out with you, destroyed), open orders with their status, and anything that needs the client's action (e.g. "1 destruction order is waiting for your authorisation"). Use plain language, not warehouse jargon.

### Portal: Inventory and box detail
- The same search experience as staff (free text, filing date range, status), limited to the client's own boxes. Selecting rows allows "Request dispatch" or "Request destruction", which opens the order request pre-filled.
- Box detail: the fields the client provided, status, date received, the warehouse name only (no rack or slot), any open order, and the client-facing history (section 5).

### Portal: Orders
- List of the client's orders with status tracking in plain language ("Requested — waiting for warehouse approval", "Scheduled for 2 Oct", "Out for delivery", "Completed").
- Request an order: choose collection, dispatch, or destruction. For dispatch and destruction, choose boxes from inventory; for collection, enter the address and the number of boxes. Destruction requests require the authorisation checkbox and typed name. Review, then submit. The confirmation page shows the order number.
- Order detail: a status stepper, the boxes, dates, and a download for documents that are ready (delivery note, certificate of destruction). The client can cancel while the order is still `requested`.

### Portal: Settings
Profile and password.

## 8. Global scanner support (staff side)

USB and Bluetooth barcode scanners act like keyboards: they type characters quickly and end with Enter. Build a `useBarcodeScanner` hook that detects this pattern (characters under ~40 ms apart, ending with Enter, minimum length 6) outside normal text fields and fires a callback. Screens can register a scoped handler that takes priority over the global one.

- Globally on the staff side: scanning a box barcode opens that box.
- In allocate/move: scanning a slot barcode confirms that slot.
- On the pick and receive screens: a scan is checked against the order (section 4).
- Show a small toast confirming what was scanned. On the pick/receive screens, give louder feedback instead.

Camera scanning is out of scope for now, but keep the hook's interface open to it.

## 9. Design direction

- One design system, two moods. The staff side is dense, fast, keyboard-first, and made for long working sessions — compact tables and a collapsible sidebar. The portal is calmer and more spacious, with a top navigation bar. Give each side its own accent color token (staff: an industrial blue or teal; portal: a distinct but compatible hue), so users always know which side they're on.
- Light and dark themes via CSS variables, with a toggle in the user menu.
- Status colors are semantic and separate from the accent. Box statuses: stored = green, reserved/picked = blue, out = violet, pending destruction = amber, destroyed = grey with a strike icon, unallocated/missing = neutral with an attention dot, on hold = red outline badge. Order types each get an icon (collection = arrow in, dispatch = arrow out, destruction = shredder) that is used consistently everywhere.
- Use tabular numbers for all counts, capacities, and order numbers.
- Staff screens must work on a 10" tablet in landscape. The pick and receive screens are tablet-first, with touch targets of at least 48 px.
- Print documents (labels, pick list, delivery note, certificate) get their own print stylesheet: black on white, with the company name/logo placeholder, page numbers, and the order barcode on the pick list so it can be scanned to open the order.
- Accessibility: visible focus, labelled controls, aria-live toasts and scan feedback, and keyboard access to everything. The slot grid uses a proper grid role.

## 10. Folder structure

```
src/
  app/            router.tsx, providers.tsx, guards (RequireAuth, RequireRole)
  api/            client.ts, types.ts, schemas, one file per resource, query keys
  mocks/          MSW handlers, seed generator, orderMachine.ts, persistence
  auth/           session context, useAuth, login page
  domain/         describeAuditEvent, order rules (eligibility, allowed actions), status metadata (labels/colors/icons)
  staff/          routes.tsx, layout, features/{dashboard,boxes,orders,warehouses,clients,audit,settings}
  portal/         routes.tsx, layout, features/{dashboard,inventory,orders,settings}
  print/          routes.tsx, bare layout, documents/{labels,pickList,deliveryNote,destructionCertificate}
  components/     shared UI (shadcn in components/ui), DataTable, LocationPath, StatusBadge, OrderTypeIcon,
                  StatusStepper, AuditTimeline, SlotGrid, BarcodeLabel, BoxPicker, EmptyState, ErrorState, PageHeader
  hooks/          useBarcodeScanner, useUrlFilters, useDebounce
  lib/            formatting, capacity math, print helpers
  styles/
```

Staff, portal, and print code must not import from each other. Shared code goes in `components/`, `domain/`, `hooks/`, `lib/`, or `api/`. Add an ESLint rule (e.g. `no-restricted-imports`) to enforce this. Business rules (which actions an order allows in its current state, which boxes are eligible for which order type) live in `domain/` and are unit-tested. Components ask `domain/` rather than re-deriving the rules.

## 11. Phases and acceptance checks

After each phase, run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`, and fix everything before moving on. Update `PLAN.md` with what's done.

1. **Foundation:** scaffold, Tailwind + shadcn, theme tokens, router with all three layouts, guards, login, 403/404, MSW with seed data and auth. *Check:* each seeded user lands on the correct side; a client typing `/app/boxes` gets redirected to `/portal`; a staff_operator opening `/app/settings/users` gets `/403`; the production build has separate chunks for staff, portal, and print.
2. **Locations:** warehouses, racks, the slot grid, and the warehouse-layout settings. *Check:* capacity numbers match the seed; blocking a slot updates the grid.
3. **Register boxes:** the wizard, label printing, slot suggestions, allocation, and the scanner hook. *Check:* registering 12 boxes for an existing client suggests slots near that client's other boxes; the labels print at 100×50 mm; capacity updates everywhere after allocation.
4. **Find a box, box detail, and audit history:** search, the box detail tabs, move, edit with reason, hold, `describeAuditEvent` with tests for every type, the client activity tab, and the global audit log. *Check:* searching part of a client name plus a filing year finds the box; the URL reproduces the search; typing a full barcode + Enter opens the box; moving a box adds a "Moved from … to … by …" event with the reason.
5. **Orders (staff):** list, create for all three types, detail, the state machine, pick and receive screens, dispatch, destruction with authorisation, and the print documents. *Check:* create a dispatch for 10 boxes → those boxes show `reserved` and the order banner → pick with scans (scanning a wrong box shows `not_on_order`) → dispatch → the boxes are `out`, the slots are freed, and each box's history reads added → picked → dispatched with the order number. A destruction including an on-hold box refuses that box with the reason. A completed destruction produces a certificate listing every box, and each box's history ends with "Destroyed (shred) as per order DST-…".
6. **Clients:** list and detail with dynamic attributes and the orders tab. *Check:* adding a new attribute in the seed shows up on the page without code changes.
7. **Portal:** dashboard, inventory, box detail with client-facing history, orders list/detail, order requests including destruction authorisation, and settings. *Check:* a client user can never see another client's boxes or orders, even by editing the URL to another ID (gets a 404, not the data); the portal history never shows staff names or slot codes; a portal destruction request appears in staff "Needs approval".
8. **Polish:** empty/error states, dark mode, tablet layout for pick/receive, and Playwright flows for login-by-role, register → print → allocate, find-a-box, dispatch end-to-end, destruction end-to-end with certificate, and portal isolation.

## 12. Assumptions (proceed with these; list them in `PLAN.md` so they can be changed)

- One login page for both sides; the user's side comes from `/auth/me`.
- Capacity is measured in box units (standard = 1, large = 2), set per slot. A box stops occupying capacity once it is dispatched or destroyed.
- Box barcodes are generated server-side (mock format `BX` + 8 digits, e.g. `BX00012345`), encoded as Code 128. Slots also have barcodes (e.g. `SL-WH1-B04-3-2`), and so do orders (their order number).
- Clients see a box's status and warehouse, but not rack or slot codes.
- Clients can request collection, dispatch, and destruction orders from the portal; staff approve them. Destruction always requires recorded client authorisation.
- A box can be on only one open order at a time.
- Audit events are append-only and created by the backend as a side effect of actions. The frontend never posts raw audit events.
- Destroyed boxes are never deleted, and remain searchable with their full history.
- Client records come from an upstream system. This UI does not create or edit clients' core records; editing is limited to warehouse-side data.
- Billing, route planning, and retention-schedule automation are out of scope for this version. Keep `destroyAfter` as a plain date field with warnings only.
- Auth token handling is behind the `auth/` module, so moving from bearer tokens to httpOnly cookies later only changes that module.
