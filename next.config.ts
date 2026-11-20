import type { NextConfig } from "next"

// Auth, Warehouse/Rack/Slot, Box, Order, and Audit are now served by the real backend
// (warehouse-management-system-backend) instead of the MSW mock. These rewrites proxy just
// those paths server-side to that backend — Clients(detail)/Portal stay on MSW until they get
// real backend routes too (see that repo's README "What's next"). DocuSoft's folders/clients
// APIs are NOT proxied here — src/store/docusoftApi.ts calls DocuSoft directly from the browser
// (see that file's comments for why).
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "https://wms-be-fohy.onrender.com"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${BACKEND_API_URL}/api/auth/:path*` },
      { source: "/api/warehouses", destination: `${BACKEND_API_URL}/api/warehouses` },
      { source: "/api/warehouses/:path*", destination: `${BACKEND_API_URL}/api/warehouses/:path*` },
      { source: "/api/racks/:path*", destination: `${BACKEND_API_URL}/api/racks/:path*` },
      { source: "/api/slots/:path*", destination: `${BACKEND_API_URL}/api/slots/:path*` },
      // Optional zones / aisles on racks, and "find a location by code" (Sprint 10).
      { source: "/api/zones/:path*", destination: `${BACKEND_API_URL}/api/zones/:path*` },
      { source: "/api/aisles/:path*", destination: `${BACKEND_API_URL}/api/aisles/:path*` },
      { source: "/api/locations/:path*", destination: `${BACKEND_API_URL}/api/locations/:path*` },
      { source: "/api/boxes", destination: `${BACKEND_API_URL}/api/boxes` },
      { source: "/api/boxes/:path*", destination: `${BACKEND_API_URL}/api/boxes/:path*` },
      { source: "/api/orders", destination: `${BACKEND_API_URL}/api/orders` },
      { source: "/api/orders/:path*", destination: `${BACKEND_API_URL}/api/orders/:path*` },
      { source: "/api/settings/:path*", destination: `${BACKEND_API_URL}/api/settings/:path*` },
      { source: "/api/audit", destination: `${BACKEND_API_URL}/api/audit` },
      { source: "/api/audit/:path*", destination: `${BACKEND_API_URL}/api/audit/:path*` },
      { source: "/api/admin-audit", destination: `${BACKEND_API_URL}/api/admin-audit` },
      // Warehouse invoices (the Sage calls themselves go from the browser to DocuSoft's proxy, not through here).
      { source: "/api/invoices", destination: `${BACKEND_API_URL}/api/invoices` },
      { source: "/api/invoices/:path*", destination: `${BACKEND_API_URL}/api/invoices/:path*` },
      // Records (retention, legal holds, certificates), pricing & billing, CSV exports, staff notifications.
      { source: "/api/records/:path*", destination: `${BACKEND_API_URL}/api/records/:path*` },
      { source: "/api/archive-records", destination: `${BACKEND_API_URL}/api/archive-records` },
      { source: "/api/archive-records/:path*", destination: `${BACKEND_API_URL}/api/archive-records/:path*` },
      { source: "/api/record-requests", destination: `${BACKEND_API_URL}/api/record-requests` },
      { source: "/api/record-requests/:path*", destination: `${BACKEND_API_URL}/api/record-requests/:path*` },
      { source: "/api/billing/:path*", destination: `${BACKEND_API_URL}/api/billing/:path*` },
      { source: "/api/exports/:path*", destination: `${BACKEND_API_URL}/api/exports/:path*` },
      { source: "/api/notifications", destination: `${BACKEND_API_URL}/api/notifications` },
      { source: "/api/notifications/:path*", destination: `${BACKEND_API_URL}/api/notifications/:path*` },
      // The signed-in staff member's own settings (their signature for certificates of destruction).
      { source: "/api/me/:path*", destination: `${BACKEND_API_URL}/api/me/:path*` },
      // Supervisor queue of scans that didn't match.
      { source: "/api/exceptions", destination: `${BACKEND_API_URL}/api/exceptions` },
      { source: "/api/exceptions/:path*", destination: `${BACKEND_API_URL}/api/exceptions/:path*` },
      // Staff users + roles (Settings → Users & roles). Not /api/clients/:id/users — that one is still MSW.
      { source: "/api/users", destination: `${BACKEND_API_URL}/api/users` },
      { source: "/api/users/:path*", destination: `${BACKEND_API_URL}/api/users/:path*` },
      // Per-client custom box fields, and the reports page.
      { source: "/api/custom-fields", destination: `${BACKEND_API_URL}/api/custom-fields` },
      { source: "/api/custom-fields/:path*", destination: `${BACKEND_API_URL}/api/custom-fields/:path*` },
      // A client's expedientes (Docbox "Expedientes - Clientes").
      // The sites (Docbox "Sedes") warehouses belong to.
      { source: "/api/sites", destination: `${BACKEND_API_URL}/api/sites` },
      { source: "/api/expedientes", destination: `${BACKEND_API_URL}/api/expedientes` },
      { source: "/api/expedientes/:path*", destination: `${BACKEND_API_URL}/api/expedientes/:path*` },
      { source: "/api/reports/:path*", destination: `${BACKEND_API_URL}/api/reports/:path*` },
      // Client details we keep locally (SAP code, tax ID, address, delivery-note columns) and contact permissions.
      { source: "/api/clients/:clientId/profile", destination: `${BACKEND_API_URL}/api/clients/:clientId/profile` },
      { source: "/api/clients/:clientId/contact-permissions", destination: `${BACKEND_API_URL}/api/clients/:clientId/contact-permissions` },
      { source: "/api/clients/:clientId/contact-permissions/:email", destination: `${BACKEND_API_URL}/api/clients/:clientId/contact-permissions/:email` },
      // Per-client detail summary + Boxes/Orders tabs are real; only /users stays on MSW.
      { source: "/api/clients/:clientId", destination: `${BACKEND_API_URL}/api/clients/:clientId` },
      { source: "/api/clients/:clientId/boxes", destination: `${BACKEND_API_URL}/api/clients/:clientId/boxes` },
      { source: "/api/clients/:clientId/orders", destination: `${BACKEND_API_URL}/api/clients/:clientId/orders` },
    ]
  },
}

export default nextConfig
